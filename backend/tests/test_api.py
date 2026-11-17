import unittest
from fastapi.testclient import TestClient
from app.main import app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)
        self.payload={
            'method':'rbf',
            'training':[{'id':str(i),'from':float(i),'to':float(i*i)} for i in range(1,31)],
            'samples':[{'id':'s1','from':3.5}],
            'curve_range':{'min':0,'max':35},
            'curve_samples':121,
        }

    def test_health(self):
        self.assertEqual(self.client.get('/api/health').json()['status'],'ok')

    def test_all_methods_contract_and_validation(self):
        for method in ('auto','linear','piecewise','rbf','smooth','exponential'):
            with self.subTest(method=method):
                r=self.client.post('/api/run',json={**self.payload,'method':method})
                self.assertEqual(r.status_code,200,r.text)
                d=r.json()
                self.assertEqual(d['requested_method'],method)
                self.assertEqual(d['predictions'][0]['id'],'s1')
                self.assertEqual(len(d['training_results']),30)
                self.assertGreaterEqual(len(d['curve']),121)
                if d['selected_method']=='piecewise':
                    self.assertEqual(d['metrics']['evaluation_count'],0)
                    self.assertIsNone(d['metrics']['mae'])
                    self.assertTrue(all(p['deviation'] is None for p in d['training_results']))
                else:
                    self.assertEqual(d['metrics']['evaluation_count'],len(self.payload['training']))
                    self.assertIsInstance(d['metrics']['mae'],float)

    def test_only_piecewise_exact_through_reference(self):
        d=self.client.post('/api/run',json={**self.payload,'method':'piecewise'}).json()
        curve={p['x']:p['y'] for p in d['curve']}
        for p in self.payload['training']:
            self.assertAlmostEqual(curve[p['from']],p['to'])
        approx=self.client.post('/api/run',json=self.payload).json()
        self.assertTrue(any(abs(p['predicted']-p['to'])>1e-3 for p,r in zip(approx['training_results'],self.payload['training']) for p in [dict(p,to=r['to'])]))

    def test_conflicting_duplicate_rejected_only_piecewise(self):
        train=[{'id':'1','from':1,'to':2},{'id':'2','from':1,'to':5},{'id':'3','from':2,'to':3}]
        r=self.client.post('/api/run',json={**self.payload,'method':'piecewise','training':train})
        self.assertEqual(r.status_code,400)
        self.assertIn('Точна інтерполяція',r.json()['detail'])
        r=self.client.post('/api/run',json={**self.payload,'method':'rbf','training':train})
        self.assertEqual(r.status_code,200)

    def test_small_training_uses_all_points(self):
        train=self.payload['training'][:5]
        r=self.client.post('/api/run',json={**self.payload,'training':train})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['metrics']['evaluation_count'],len(train))

    def test_lan_cors_header(self):
        response = self.client.get(
            '/api/health',
            headers={'Origin': 'http://192.168.1.40:5173'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get('access-control-allow-origin'),
            'http://192.168.1.40:5173',
        )

    def test_exponential_decreasing_prediction(self):
        from math import exp
        training = [
            {'id': str(x), 'from': float(x), 'to': 50 - 12*(1 - exp(-x/8))}
            for x in range(30)
        ]
        payload = {
            **self.payload,
            'method': 'exponential',
            'training': training,
            'samples': [{'id': 'a', 'from': 5}, {'id': 'b', 'from': 20}],
        }
        response = self.client.post('/api/run', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertLess(data['model']['parameters']['gain'], 0)
        self.assertLess(data['predictions'][1]['to'], data['predictions'][0]['to'])

    def test_legacy_polynomial_method_maps_to_rbf(self):
        response = self.client.post('/api/run', json={**self.payload, 'method': 'polynomial'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['selected_method'], 'rbf')
        self.assertEqual(response.json()['requested_method'], 'rbf')

    def test_export_model(self):
        r=self.client.post('/api/run',json=self.payload)
        self.assertEqual(r.status_code,200)
        e=self.client.get('/api/model/export')
        self.assertEqual(e.status_code,200)
        self.assertEqual(e.json()['kind'],'rbf')


if __name__=='__main__':
    unittest.main()
