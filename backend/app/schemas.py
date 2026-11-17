"""Pydantic-моделі запитів до API корекції вимірювань."""
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
import math


class TrainingPoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(min_length=1, max_length=128)
    from_: float = Field(alias="from")
    to: float

    @field_validator("from_", "to")
    @classmethod
    def finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Неприпустиме значення NaN/Infinity")
        return value


class SamplePoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(min_length=1, max_length=128)
    from_: float = Field(alias="from")

    @field_validator("from_")
    @classmethod
    def finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Неприпустиме значення NaN/Infinity")
        return value


class CurveRange(BaseModel):
    min: float
    max: float

    @field_validator("min", "max")
    @classmethod
    def finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Неприпустиме значення NaN/Infinity")
        return value


class RunRequest(BaseModel):
    method: Literal["auto", "linear", "piecewise", "rbf", "polynomial", "smooth", "exponential"]
    training: list[TrainingPoint] = Field(min_length=2, max_length=10000)
    samples: list[SamplePoint] = Field(max_length=10000)
    curve_range: CurveRange
    curve_samples: int = Field(ge=2, le=401)
