"""REST API: математична модель розташована в models.py."""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .schemas import RunRequest
from .models import Point, fit, choose_auto, assess, warnings_for_training

app = FastAPI(title='STEM Calibration API', version='1.4.0')
app.add_middleware(CORSMiddleware,
    allow_origins=['http://localhost:5173','http://127.0.0.1:5173'],
    allow_origin_regex=r'^http://(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$',
    allow_credentials=False, allow_methods=['GET','POST'], allow_headers=['Content-Type'])

latest_model = None


@app.get('/api/health')
def health():
    return {'status':'ok'}


@app.post('/api/run')
def run(request: RunRequest):
    global latest_model
    if request.curve_range.min >= request.curve_range.max:
        raise HTTPException(status_code=400, detail='Діапазон кривої має мати min < max')
    if len({p.id for p in request.training}) != len(request.training) or len({p.id for p in request.samples}) != len(request.samples):
        raise HTTPException(status_code=400, detail='ID всередині набору мають бути унікальними')
    training = [Point(p.from_,p.to) for p in request.training]
    if len({p.x for p in training})<2:
        raise HTTPException(status_code=400, detail='Потрібно щонайменше два різні FROM')
    # Старі JSON-запити з polynomial використовують нову RBF-модель.
    requested = 'rbf' if request.method == 'polynomial' else request.method
    try:
        selected = choose_auto(training) if requested=='auto' else requested
        model = fit(training,selected)
        metrics = assess(training,selected,model)
        lo,hi = request.curve_range.min,request.curve_range.max
        step = (hi-lo)/(request.curve_samples-1)
        xs = sorted({lo+i*step for i in range(request.curve_samples)} |
                    {p.x for p in training if lo<=p.x<=hi})
        curve = [{'x':x,'y':model.predict(x)} for x in xs]
        predicted_train = [model.predict(p.from_) for p in request.training]
        predicted_data = [model.predict(p.from_) for p in request.samples]
        if not all(isfinite(v) for v in [*(p['y'] for p in curve),*predicted_train,*predicted_data]):
            raise ValueError('Розрахунок дав NaN або Infinity')
    except (ValueError,OverflowError,ZeroDivisionError) as error:
        raise HTTPException(status_code=400,detail=str(error)) from error

    warnings = warnings_for_training(training,metrics['mae'])
    min_x,max_x = min(p.x for p in training),max(p.x for p in training)
    if any(not min_x<=p.from_<=max_x for p in request.samples):
        warnings.append({'code':'EXTRAPOLATION','severity':'warning',
                         'message':'Частина робочих значень за межами навчання: екстраполяція.'})
    latest_model = {'version':3,'kind':model.kind,'parameters':model.parameters,
                    'trained_at':datetime.now(timezone.utc).isoformat()}
    return {
        'requested_method':requested,'selected_method':selected,
        'model':{'kind':model.kind,'parameters':model.parameters},
        'training_results':[{'id':p.id,'predicted':y,'deviation':None if selected == 'piecewise' else abs(y-p.to)} for p,y in zip(request.training,predicted_train)],
        'predictions':[{'id':p.id,'to':y} for p,y in zip(request.samples,predicted_data)],
        'curve':curve,'metrics':metrics,'warnings':warnings,
    }


@app.get('/api/model/export')
def model_export():
    if latest_model is None:
        raise HTTPException(status_code=404,detail='Спочатку навчіть модель')
    return latest_model
