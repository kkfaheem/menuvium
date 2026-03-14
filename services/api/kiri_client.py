from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import requests


KIRI_BASE_URL = "https://api.kiriengine.app/api"


class KiriApiError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        status_code: int | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


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

    @staticmethod
    def _clean_message(value) -> str | None:
        if not isinstance(value, str):
            return None
        stripped = value.strip()
        return stripped or None

    @staticmethod
    def _normalize_code(value) -> int | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped == "":
                return None
            try:
                return int(stripped)
            except ValueError:
                return None
        return None

    @staticmethod
    def _normalize_ok(value) -> bool | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            stripped = value.strip().lower()
            if stripped in {"true", "1", "yes"}:
                return True
            if stripped in {"false", "0", "no"}:
                return False
        return None

    def _parse_response(self, response: requests.Response) -> dict:
        try:
            payload = response.json()
        except ValueError as exc:
            raise KiriApiError(
                f"KIRI returned non-JSON response ({response.status_code})",
                status_code=response.status_code,
            ) from exc

        if not isinstance(payload, dict):
            raise KiriApiError(
                f"KIRI returned an unexpected response shape ({response.status_code})",
                status_code=response.status_code,
            )

        code = self._normalize_code(payload.get("code"))
        ok = self._normalize_ok(payload.get("ok"))
        provider_message = self._clean_message(payload.get("msg"))
        data = payload.get("data")

        provider_signals_success = provider_message is not None and provider_message.lower() == "success"
        has_success_shape = isinstance(data, dict) and (
            "serialize" in data or "modelUrl" in data or "status" in data or "balance" in data
        )
        if (
            200 <= response.status_code < 300
            and has_success_shape
            and provider_signals_success
            and code in (0, 200, None)
        ):
            return data

        def build_error_message(prefix: str) -> str:
            details: list[str] = [prefix]
            if code is not None:
                details.append(f"code {code}")
            if provider_message and provider_message.lower() != "success":
                details.append(provider_message)
            elif provider_message:
                details.append("provider returned msg='success' on an error response")
            return " - ".join(details)

        if response.status_code >= 400:
            raise KiriApiError(
                build_error_message(f"KIRI HTTP {response.status_code}"),
                code=code,
                status_code=response.status_code,
            )

        if ok is False or code not in (0, None):
            raise KiriApiError(
                build_error_message("KIRI returned a non-success response"),
                code=code,
                status_code=response.status_code,
            )

        if not isinstance(data, dict):
            raise KiriApiError(
                "KIRI response missing data object",
                code=code,
                status_code=response.status_code,
            )
        return data
