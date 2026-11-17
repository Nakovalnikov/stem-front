import unittest
from math import isfinite, sin
from app.models import Point, fit, choose_auto, assess, accuracy, warnings_for_training


class ModelTests(unittest.TestCase):
    def test_linear_regression(self):
        m = fit([Point(1,3), Point(2,5), Point(3,7)],'linear')
        self.assertAlmostEqual(m.predict(4),9)
        self.assertAlmostEqual(accuracy(m,[Point(1,3)])['mae'],0)

    def test_linear_cannot_descend(self):
        m = fit([Point(0,10),Point(1,-2),Point(2,-10)],'linear')
        self.assertGreaterEqual(m.predict(2)-m.predict(1),0)

    def test_piecewise_is_exact_even_when_descending(self):
        pts = [Point(0,4),Point(1,1),Point(2,6)]
        m = fit(pts,'piecewise')
        for p in pts:
            self.assertAlmostEqual(m.predict(p.x),p.y)
        self.assertLess(m.predict(.5),m.predict(0))

    def test_approximating_rbf_is_not_exact(self):
        pts = [Point(x,x+3*sin(x/2)) for x in range(30)]
        m = fit(pts,'rbf')
        self.assertGreater(max(abs(m.predict(p.x)-p.y) for p in pts),.01)
        self.assertEqual(m.parameters['algorithm'],'regularized Gaussian RBF regression with monotone projection')

    def test_rbf_models_local_nonlinearity_better_than_global_models(self):
        from math import exp
        pts = [Point(x, x + 12/(1+exp(-(x-25)/2.5)) + (x%3-1)*.07)
               for x in range(51)]
        rbf = fit(pts, 'rbf')
        linear_mae = accuracy(fit(pts, 'linear'), pts)['mae']
        exponential_mae = accuracy(fit(pts, 'exponential'), pts)['mae']
        rbf_mae = accuracy(rbf, pts)['mae']
        self.assertLess(rbf_mae, linear_mae * .5)
        self.assertLess(rbf_mae, exponential_mae * .5)
        self.assertEqual(len(rbf.parameters['centers']), 16)
        self.assertIn('basis_weights', rbf.parameters)
        self.assertTrue(all(rbf.predict(i+.1) >= rbf.predict(i)-1e-8 for i in range(50)))
        self.assertEqual(choose_auto(pts), 'rbf')

    def test_rbf_small_input_and_dense_training(self):
        two = fit([Point(0, 2), Point(10, 12)], 'rbf')
        self.assertAlmostEqual(two.predict(5), 7, places=3)
        many = [Point(x*.1, x*.1 + .1*sin(x*.1/4)) for x in range(1200)]
        rbf = fit(many, 'rbf')
        self.assertEqual(len(rbf.parameters['centers']), 16)
        self.assertEqual(assess(many, 'rbf', rbf)['evaluation_count'], len(many))
        self.assertTrue(isfinite(rbf.predict(100)))

    def test_moving_window_selected_on_all_training_data(self):
        pts = [Point(x,x+(-8 if x%2 else 8)) for x in range(60)]
        m = fit(pts,'smooth')
        self.assertIn('window',m.parameters)
        self.assertEqual(m.parameters['selection'], 'training MAE + derivative roughness')
        self.assertGreater(m.parameters['window'],1)

    def test_all_non_piecewise_are_monotone_on_noisy_data(self):
        pts = [Point(x,x+(-20 if x%2 else 20)) for x in range(60)]
        for method in ('linear','rbf','smooth','exponential'):
            with self.subTest(method=method):
                m = fit(pts,method)
                xs = [i/10 for i in range(-50,650)]
                y = [m.predict(x) for x in xs]
                self.assertTrue(all(isfinite(z) for z in y))
                self.assertTrue(all(b >= a-1e-8 for a,b in zip(y,y[1:])))

    def test_training_metrics_use_every_point_except_piecewise(self):
        pts = [Point(x,x+sin(x)) for x in range(30)]
        for method in ('linear','rbf','smooth','exponential'):
            with self.subTest(method=method):
                met = assess(pts,method)
                self.assertEqual(met['evaluation_count'],len(pts))
                self.assertGreaterEqual(met['mae'],0)
        piecewise = assess(pts,'piecewise')
        self.assertIsNone(piecewise['mae'])
        self.assertEqual(piecewise['evaluation_count'],0)

    def test_exponential_is_monotone_and_not_exact(self):
        pts = [Point(x, 3 + x + 2*sin(x/2)) for x in range(32)]
        model = fit(pts, 'exponential')
        self.assertEqual(model.parameters['algorithm'], 'signed monotone exponential regression')
        self.assertGreater(max(abs(model.predict(p.x)-p.y) for p in pts),.01)
        xs = [i/10 for i in range(-60,380)]
        ys = [model.predict(x) for x in xs]
        self.assertTrue(all(b >= a-1e-8 for a,b in zip(ys,ys[1:])))

    def test_exponential_captures_growth_curve(self):
        pts = [Point(x, 3 + 10*(1-__import__('math').exp(-x/8))) for x in range(31)]
        model = fit(pts,'exponential')
        self.assertLess(accuracy(model,pts)['mae'], .12)

    def test_exponential_can_decrease(self):
        pts = [Point(float(x), 50 - 12*(1-__import__('math').exp(-x/8))) for x in range(30)]
        model = fit(pts, 'exponential')
        self.assertLess(model.parameters['gain'], 0)
        self.assertEqual(model.parameters['direction'], 'decreasing')
        self.assertLess(model.predict(20), model.predict(5))
        self.assertLess(accuracy(model, pts)['mae'], .2)

    def test_small_dataset_metrics_exist_for_approximating_models(self):
        pts = [Point(x,x+sin(x)) for x in range(5)]
        for method in ('linear','rbf','smooth','exponential'):
            self.assertEqual(assess(pts,method)['evaluation_count'],len(pts))

    def test_rbf_is_global_not_moving_window(self):
        pts = [Point(x, x + sin(x/2)) for x in range(25)]
        rbf = fit(pts,'rbf')
        moving = fit(pts,'smooth')
        self.assertNotIn('window',rbf.parameters)
        self.assertIn('window',moving.parameters)
        self.assertTrue(any(abs(rbf.predict(x)-moving.predict(x))>1e-5 for x in (2,6,13,22)))

    def test_contradictions_allowed_only_by_regressions(self):
        pts=[Point(1,1),Point(1,8),Point(2,4),Point(3,3)]
        with self.assertRaises(ValueError):
            fit(pts,'piecewise')
        for method in ('linear','rbf','smooth','exponential'):
            self.assertTrue(isfinite(fit(pts,method).predict(2)))
        self.assertTrue(any(w['code']=='CONTRADICTION' for w in warnings_for_training(pts,None)))

    def test_auto_prefers_linear_when_linear_data(self):
        pts=[Point(x,2*x+1) for x in range(30)]
        self.assertEqual(choose_auto(pts),'linear')

    def test_auto_never_chooses_piecewise(self):
        pts=[Point(x,50-x) for x in range(30)]
        self.assertIn(choose_auto(pts),('linear','rbf','smooth','exponential'))

    def test_extrapolation_finite(self):
        pts=[Point(x, x+3*sin(x)) for x in range(30)]
        for method in ('linear','piecewise','rbf','smooth','exponential'):
            self.assertTrue(isfinite(fit(pts,method).predict(-5)))
            self.assertTrue(isfinite(fit(pts,method).predict(40)))


if __name__=='__main__':
    unittest.main()
