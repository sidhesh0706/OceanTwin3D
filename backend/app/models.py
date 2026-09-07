from typing import Literal

from pydantic import BaseModel, Field


class ProfileSample(BaseModel):
    depth: float = Field(ge=0)
    temperature: float | None = None
    salinity: float | None = None
    chlorophyll: float | None = None


class ObservationSource(BaseModel):
    id: str
    instrument_type: Literal["ARGO", "GLIDER", "CTD", "MOORING", "ADCP"]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    timestamp: str
    synthetic: bool = True
    profiles: list[ProfileSample]
