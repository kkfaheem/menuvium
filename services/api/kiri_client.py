from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import requests


KIRI_BASE_URL = "https://api.kiriengine.app/api"


class KiriApiError(RuntimeError):
    def __init__(self, message: str, *, code: int | None = None):
        super().__init__(message)
        self.code = code


@dataclass
class KiriSubmittedJob:
    serialize: str
    calculate_type: int


@dataclass
class KiriModelStatus:
    serialize: str
    status: int


@dataclass
class KiriModelZip:
    serialize: str
    model_url: str


class KiriClient:
    def __init__(self, api_key: str, *, base_url: str = KIRI_BASE_URL, timeout: float = 300.0):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {api_key}"})

    def submit_photo_images(
        self,
        *,
        image_paths: Iterable[Path],
        file_format: str,
        model_quality: int,
        texture_quality: int,
        texture_smoothing: int,
        is_mask: int,
    ) -> KiriSubmittedJob:
        files = [("imagesFiles", (path.name, path.open("rb"))) for path in image_paths]
        try:
            data = {
                "fileFormat": file_format,
                "modelQuality": str(model_quality),
                "textureQuality": str(texture_quality),
                "textureSmoothing": str(texture_smoothing),
                "isMask": str(is_mask),
            }
            payload = self._post("/v1/open/photo/image", files=files, data=data)
            return KiriSubmittedJob(
                serialize=str(payload["serialize"]),
                calculate_type=int(payload["calculateType"]),
            )
        finally:
            for _, (_, handle) in files:
                handle.close()

    def submit_photo_video(
        self,
        *,
        video_path: Path,
        file_format: str,
        model_quality: int,
        texture_quality: int,
        texture_smoothing: int,
        is_mask: int,
    ) -> KiriSubmittedJob:
        with video_path.open("rb") as handle:
            payload = self._post(
                "/v1/open/photo/video",
                files={"videoFile": (video_path.name, handle)},
                data={
                    "fileFormat": file_format,
                    "modelQuality": str(model_quality),
                    "textureQuality": str(texture_quality),
                    "textureSmoothing": str(texture_smoothing),
                    "isMask": str(is_mask),
                },
            )
        return KiriSubmittedJob(
            serialize=str(payload["serialize"]),
            calculate_type=int(payload["calculateType"]),
        )

    def submit_featureless_images(self, *, image_paths: Iterable[Path], file_format: str) -> KiriSubmittedJob:
        files = [("imagesFiles", (path.name, path.open("rb"))) for path in image_paths]
        try:
            payload = self._post(
                "/v1/open/featureless/image",
                files=files,
                data={"fileFormat": file_format},
            )
            return KiriSubmittedJob(
                serialize=str(payload["serialize"]),
                calculate_type=int(payload["calculateType"]),
            )
        finally:
            for _, (_, handle) in files:
                handle.close()

    def submit_featureless_video(self, *, video_path: Path, file_format: str) -> KiriSubmittedJob:
        with video_path.open("rb") as handle:
            payload = self._post(
                "/v1/open/featureless/video",
                files={"videoFile": (video_path.name, handle)},
                data={"fileFormat": file_format},
            )
        return KiriSubmittedJob(
            serialize=str(payload["serialize"]),
            calculate_type=int(payload["calculateType"]),
        )

    def get_status(self, *, serialize: str) -> KiriModelStatus:
        payload = self._get("/v1/open/model/getStatus", params={"serialize": serialize})
        return KiriModelStatus(serialize=str(payload["serialize"]), status=int(payload["status"]))

    def get_model_zip(self, *, serialize: str) -> KiriModelZip:
        payload = self._get("/v1/open/model/getModelZip", params={"serialize": serialize})
        return KiriModelZip(serialize=str(payload["serialize"]), model_url=str(payload["modelUrl"]))

    def _post(self, path: str, *, files, data: dict) -> dict:
        response = self.session.post(
            f"{self.base_url}{path}",
            files=files,
            data=data,
            timeout=self.timeout,
        )
        return self._parse_response(response)

    def _get(self, path: str, *, params: dict) -> dict:
        response = self.session.get(f"{self.base_url}{path}", params=params, timeout=self.timeout)
        return self._parse_response(response)

    def _parse_response(self, response: requests.Response) -> dict:
        try:
            payload = response.json()
        except ValueError as exc:
            raise KiriApiError(f"KIRI returned non-JSON response ({response.status_code})") from exc

        if response.status_code >= 400:
            raise KiriApiError(
                payload.get("msg") or response.text or f"HTTP {response.status_code}",
                code=payload.get("code"),
            )

        if not payload.get("ok", False) or payload.get("code") not in (0, None):
            raise KiriApiError(payload.get("msg") or "KIRI request failed", code=payload.get("code"))

        data = payload.get("data")
        if not isinstance(data, dict):
            raise KiriApiError("KIRI response missing data object", code=payload.get("code"))
        return data
