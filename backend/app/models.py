"""Корекція вимірювань без сторонніх математичних пакетів.

piecewise  — точна ламана, без обмеження знака похідної.
linear     — неспадна лінійна регресія.
rbf        — гаусова RBF-регресія з обмеженням монотонності.
smooth     — неспадна локальна крива з ковзним вікном.
exponential — глобальна експоненціальна регресія зі зростанням або спаданням.

Усі методи навчаються на 100% TRAINING. Відображені похибки є
внутрішньовибірковими, а не незалежною оцінкою якості на нових даних.
Для точної ламаної похибка у навчальних вузлах неінформативна: метрики Н/Д.
"""
from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from math import exp, expm1, isfinite, sqrt
from statistics import mean
from typing import Callable, Literal

Method = Literal['linear', 'piecewise', 'rbf', 'smooth', 'exponential']


@dataclass(frozen=True)
class Point:
    x: float
    y: float


@dataclass
class FittedModel:
    kind: Method
    parameters: dict
    predict: Callable[[float], float]


def _support(points: list[Point], exact: bool = False) -> list[Point]:
    """Групуємо однакові X. Для точної ламаної суперечності заборонені."""
    ordered = sorted(points, key=lambda p: p.x)
    result: list[Point] = []
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and ordered[j].x == ordered[i].x:
            j += 1
        ys = [p.y for p in ordered[i:j]]
        if exact and min(ys) != max(ys):
            raise ValueError('Точна інтерполяція неможлива: одному FROM відповідають різні TO.')
        result.append(Point(ordered[i].x, mean(ys)))
        i = j
    if len(result) < 2:
        raise ValueError('Потрібно щонайменше два різні значення FROM')
    return result


def _isotonic(values: list[float], weights: list[float] | None = None) -> list[float]:
    """PAVA: мінімальна зважена квадратична похибка за y[i+1] >= y[i]."""
    weights = weights or [1.0] * len(values)
    blocks: list[list[float]] = []  # mean, weight, count
    for value, weight in zip(values, weights):
        blocks.append([value, weight, 1.0])
        while len(blocks) >= 2 and blocks[-2][0] > blocks[-1][0]:
            b, a = blocks.pop(), blocks.pop()
            w = a[1] + b[1]
            blocks.append([(a[0] * a[1] + b[0] * b[1]) / w, w, a[2] + b[2]])
    return [b[0] for b in blocks for _ in range(int(b[2]))]


def _moving_average(ys: list[float], window: int) -> list[float]:
    """Незважене симетричне вікно зі стабільними межами, O(n)."""
    radius = window // 2
    prefix = [0.0]
    for y in ys:
        prefix.append(prefix[-1] + y)
    out = []
    for i in range(len(ys)):
        left, right = max(0, i-radius), min(len(ys), i+radius+1)
        out.append((prefix[right] - prefix[left]) / (right-left))
    return out


def _monotone_cubic(xs: list[float], ys: list[float], kind: Method, parameters: dict) -> FittedModel:
    """PCHIP із невід’ємними дотичними. У вузлах збігається зі згладженими ys."""
    n = len(xs)
    h = [xs[i+1]-xs[i] for i in range(n-1)]
    secants = [max(0.0, (ys[i+1]-ys[i])/h[i]) for i in range(n-1)]
    tangent = [0.0]*n
    tangent[0], tangent[-1] = secants[0], secants[-1]
    for i in range(1, n-1):
        a, b = secants[i-1], secants[i]
        if a > 0 and b > 0:
            w1, w2 = 2*h[i]+h[i-1], h[i]+2*h[i-1]
            tangent[i] = (w1+w2)/(w1/a+w2/b)
    # Обмеження PCHIP: невід’ємна похідна на всіх інтервалах.
    def predict(x: float) -> float:
        if x < xs[0]:
            return ys[0] + tangent[0]*(x-xs[0])
        if x > xs[-1]:
            return ys[-1] + tangent[-1]*(x-xs[-1])
        i = max(0, min(n-2, bisect_right(xs, x)-1))
        t = (x-xs[i])/h[i]
        return ((2*t**3-3*t**2+1)*ys[i]
                +(t**3-2*t**2+t)*h[i]*tangent[i]
                +(-2*t**3+3*t**2)*ys[i+1]
                +(t**3-t**2)*h[i]*tangent[i+1])
    parameters = {**parameters, 'algorithm': parameters.get('algorithm', 'monotone cubic Hermite approximation'),
                  'knots': [{'x': x, 'y': y} for x,y in zip(xs,ys)], 'derivatives': tangent}
    return FittedModel(kind, parameters, predict)


def fit_linear(points: list[Point]) -> FittedModel:
    if len(points) < 2:
        raise ValueError('Потрібно щонайменше дві точки')
    cx, cy = mean(p.x for p in points), mean(p.y for p in points)
    denom = sum((p.x-cx)**2 for p in points)
    if denom <= 0:
        raise ValueError('Потрібні різні значення FROM')
    slope = max(0.0, sum((p.x-cx)*(p.y-cy) for p in points)/denom)
    intercept = cy - slope*cx
    return FittedModel('linear', {'slope': slope, 'intercept': intercept, 'monotone': True},
                       lambda x: slope*x+intercept)


def fit_piecewise(points: list[Point]) -> FittedModel:
    support = _support(points, exact=True)
    xs = [p.x for p in support]
    def predict(x: float) -> float:
        i = max(0, min(len(xs)-2, bisect_right(xs,x)-1))
        a,b = support[i],support[i+1]
        return a.y+(x-a.x)*(b.y-a.y)/(b.x-a.x)
    return FittedModel('piecewise', {'points': [{'x':p.x,'y':p.y} for p in support],
                                      'monotone': False}, predict)


def _fit_curve(points: list[Point], window: int, kind: Method) -> FittedModel:
    support = _support(points)
    xs = [p.x for p in support]
    ys = _isotonic([p.y for p in support])
    # Вікно згладжує шум, ізотонічна проєкція гарантує монотонність.
    ys = _isotonic(_moving_average(ys, window))
    return _monotone_cubic(xs,ys,kind,{'window':window, 'monotone':True})


def _solve_system(matrix: list[list[float]], values: list[float]) -> list[float]:
    """Розв’язуємо невелику систему методом Гаусса з частковим вибором опори."""
    n = len(values)
    a = [row[:] + [v] for row, v in zip(matrix, values)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(a[row][col]))
        if abs(a[pivot][col]) < 1e-12:
            raise ValueError('Не вдалося підібрати параметри RBF')
        a[col], a[pivot] = a[pivot], a[col]
        div = a[col][col]
        for j in range(col, n + 1):
            a[col][j] /= div
        for i in range(col + 1, n):
            factor = a[i][col]
            for j in range(col + 1, n + 1):
                a[i][j] -= factor * a[col][j]
            a[i][col] = 0.0
    solution = [0.0] * n
    for i in range(n - 1, -1, -1):
        solution[i] = a[i][n] - sum(a[i][j] * solution[j] for j in range(i + 1, n))
    return solution


def fit_rbf(points: list[Point]) -> FittedModel:
    """Локальна регресія гаусовими RBF із регуляризацією та монотонною проєкцією.

    На відміну від ковзного вікна, навчаємо спільні ваги локальних базисних
    функцій. Ізотонічна проєкція не дає кривій спадати; PCHIP зберігає гладкість.
    Кількість базисів обмежена, тож час навчання майже лінійний за кількістю точок.
    """
    support = _support(points)
    xmin, xmax = support[0].x, support[-1].x
    width = xmax - xmin
    ymin = min(p.y for p in points)
    yrange = max(max(p.y for p in points) - ymin, 1e-9)

    # Базисів набагато менше, ніж точок: модель не заучує кожне вимірювання.
    count = min(16, len(support))
    centers = [i / (count - 1) for i in range(count)]
    bandwidth = max(0.09, 1.5 / (count - 1))
    regularization = 0.004
    size = count + 2  # Вільний член, лінійний тренд і локальні RBF.
    gram = [[0.0] * size for _ in range(size)]
    rhs = [0.0] * size

    def features(t: float) -> list[float]:
        return [1.0, t] + [exp(-0.5 * ((t-c) / bandwidth) ** 2) for c in centers]

    for p in points:
        t = (p.x - xmin) / width
        row = features(t)
        target = (p.y - ymin) / yrange
        for i in range(size):
            rhs[i] += row[i] * target
            for j in range(i + 1):
                gram[i][j] += row[i] * row[j]

    for i in range(size):
        for j in range(i + 1, size):
            gram[i][j] = gram[j][i]
        gram[i][i] += max(1e-9, regularization * len(points)) if i >= 2 else 1e-9

    coeffs = _solve_system(gram, rhs)

    def raw(t: float) -> float:
        return ymin + yrange * sum(c * b for c, b in zip(coeffs, features(t)))

    # На густій сітці виправляємо спадні ділянки, після чого інтерполюємо PCHIP.
    # Це залишається RBF-регресією, але з монотонною післяобробкою прогнозу.
    grid_size = 241
    xs = [xmin + width * i / (grid_size - 1) for i in range(grid_size)]
    ys = _isotonic([raw((x-xmin) / width) for x in xs])
    return _monotone_cubic(xs, ys, 'rbf', {
        'algorithm': 'regularized Gaussian RBF regression with monotone projection',
        'centers': [xmin + width*c for c in centers],
        'bandwidth': width * bandwidth,
        'regularization': regularization,
        'basis_weights': coeffs[2:],
        'baseline_coefficients': coeffs[:2],
        'monotone': True,
    })


def _window_candidates(n: int) -> list[int]:
    windows = [3, 5, 9, 15, 25, 41, max(3, (round(n*0.12)//2)*2+1)]
    return sorted(set(min(n if n%2 else n-1, w) for w in windows if n>=3)) or [1]


def _roughness(model: FittedModel, xs: list[float]) -> float:
    """Безрозмірний штраф за локальні стрибки нахилу."""
    if len(xs)<4:
        return 0.0
    count = min(61, len(xs))
    lo,hi = xs[0],xs[-1]
    grid = [lo+(hi-lo)*i/(count-1) for i in range(count)]
    values = [model.predict(x) for x in grid]
    steps = [values[i+1]-values[i] for i in range(count-1)]
    trend = max(abs(values[-1]-values[0]), 1e-9)
    return sum(abs(steps[i]-steps[i-1]) for i in range(1,len(steps)))/trend


def _training_mae(model: FittedModel, points: list[Point]) -> float:
    return mean(abs(model.predict(p.x)-p.y) for p in points)


def fit_moving(points: list[Point]) -> FittedModel:
    support = _support(points)
    span = max(p.y for p in support)-min(p.y for p in support)
    best_window, best_score = 1, float('inf')
    for window in _window_candidates(len(support)):
        candidate = _fit_curve(support,window,'smooth')
        score = (_training_mae(candidate,points) +
                 0.04*max(span,1e-6)*_roughness(candidate,[p.x for p in support]))
        if score<best_score:
            best_score,best_window = score,window
    final = _fit_curve(points,best_window,'smooth')
    final.parameters.update({'selection':'training MAE + derivative roughness', 'score':best_score})
    return final


def fit_exponential(points: list[Point]) -> FittedModel:
    """Глобальна експонента з можливим насиченням / прискоренням.

    y = a + b * expm1(k*t) / expm1(k), t=(x-xmin)/(xmax-xmin).
    Коефіцієнт b може бути від’ємним: крива може спадати. За межами навчання
    використовуємо дотичні, щоб уникнути неконтрольованої експоненти.
    Добираємо k серед кандидатів без сторонніх математичних пакетів.
    """
    support = _support(points)
    xmin, xmax = support[0].x, support[-1].x
    width = xmax - xmin
    sample = [( (p.x - xmin)/width, p.y ) for p in points]
    mean_y = mean(p.y for p in points)
    spread = max(p.y for p in points) - min(p.y for p in points)

    def shape(t: float, k: float) -> float:
        return t if k == 0 else expm1(k*t)/expm1(k)

    winner: FittedModel | None = None
    best = float('inf')
    for k in (-5.,-3.5,-2.,-1.,-.4,0.,.4,1.,2.,3.5,5.):
        xs = [shape(t,k) for t,_ in sample]
        mx = mean(xs)
        var = sum((v-mx)**2 for v in xs)
        if var <= 1e-15:
            continue
        gain = sum((v-mx)*(y-mean_y) for v,(_,y) in zip(xs,sample))/var
        intercept = mean_y - gain*mx
        # Похідна dy/dt = gain * k*exp(k*t)/expm1(k) має знак gain.
        slope0 = gain if k == 0 else gain*k/expm1(k)
        slope1 = gain if k == 0 else gain*k*exp(k)/expm1(k)

        def predict(x: float, k=k, gain=gain, intercept=intercept,
                    slope0=slope0, slope1=slope1) -> float:
            t = (x-xmin)/width
            if t < 0:
                return intercept+slope0*t
            if t > 1:
                return intercept+gain+slope1*(t-1)
            return intercept+gain*shape(t,k)

        candidate = FittedModel('exponential',{
            'algorithm':'signed monotone exponential regression',
            'curvature':k,'intercept':intercept,'gain':gain,
            'x_range':[xmin,xmax], 'monotone': True, 'direction': 'decreasing' if gain < 0 else 'increasing'}, predict)
        score = _training_mae(candidate,points) + .025*max(spread,1e-9)*_roughness(candidate,[p.x for p in support])
        if score < best:
            winner, best = candidate, score
    if winner is None:
        raise ValueError('Не вдалося побудувати експоненційну регресію')
    return winner


def fit(points: list[Point], method: Method) -> FittedModel:
    return {'linear':fit_linear,'piecewise':fit_piecewise,
            'rbf':fit_rbf,'smooth':fit_moving,
            'exponential':fit_exponential}[method](points)


def assess(points: list[Point], method: Method, model: FittedModel | None = None) -> dict:
    """Описова похибка на 100% навчальних точок (не тестова похибка)."""
    if method == 'piecewise':
        return {'mae':None,'rmse':None,'max_error':None,'evaluation_count':0}
    candidate = model if model is not None else fit(points, method)
    errors = [abs(candidate.predict(p.x)-p.y) for p in points]
    return {'mae':mean(errors), 'rmse':sqrt(mean(e*e for e in errors)),
            'max_error':max(errors), 'evaluation_count':len(points)}


def choose_auto(points: list[Point]) -> Method:
    """Критерій на 100% даних: MAE навчання + плавність і складність.

    Точну ламану виключаємо через гарантоване проходження через вузли.
    Це оцінка якості АПРОКСИМАЦІЇ, а не перевірка на відкладеній вибірці.
    """
    methods: list[Method] = ['linear','rbf','smooth','exponential']
    support = _support(points)
    span = max(p.y for p in support)-min(p.y for p in support)
    scores = []
    for method in methods:
        model = fit(points,method)
        metrics = assess(points,method,model)
        rough = _roughness(model,[p.x for p in support])
        complexity = {'linear':0, 'rbf':0.016, 'smooth':0.02, 'exponential':0.014}[method]
        score = metrics['mae'] + 0.04*max(span,1e-6)*rough + complexity*max(span,1e-6)
        scores.append((score,method))
    return min(scores,key=lambda entry:(entry[0],methods.index(entry[1])))[1]


def accuracy(model: FittedModel, points: list[Point]) -> dict[str,float]:
    """Навчальна похибка (для тестів/діагностики, НЕ для UI-валідації)."""
    errors = [abs(model.predict(p.x)-p.y) for p in points]
    return {'mae':mean(errors),'rmse':sqrt(mean(e*e for e in errors)),
            'max_error':max(errors)}


def warnings_for_training(points: list[Point], mae: float | None) -> list[dict[str,str]]:
    warnings = []
    by_x: dict[float,set[float]] = {}
    for p in points:
        by_x.setdefault(p.x,set()).add(p.y)
    if any(len(values)>1 for values in by_x.values()):
        warnings.append({'code':'CONTRADICTION','severity':'warning',
                         'message':'Однаковим FROM відповідають різні TO. Точна ламана неможлива.'})
    if mae is not None:
        span = max(p.y for p in points)-min(p.y for p in points)
        if mae > max(.1,span*.25):
            warnings.append({'code':'HIGH_TRAINING_ERROR','severity':'warning',
                             'message':'Середня похибка на навчальних точках завелика.'})
    return warnings
