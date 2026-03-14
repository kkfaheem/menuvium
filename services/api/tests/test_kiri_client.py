from kiri_client import KiriApiError, KiriClient


class FakeResponse:
    def __init__(self, *, status_code: int, payload: dict, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload


def test_parse_response_accepts_string_zero_code_and_string_ok():
    client = KiriClient(api_key="test-key")
    response = FakeResponse(
        status_code=200,
        payload={
            "ok": "true",
            "code": "0",
            "msg": "success",
            "data": {"serialize": "abc123", "calculateType": 1},
        },
    )

    payload = client._parse_response(response)  # noqa: SLF001

    assert payload["serialize"] == "abc123"
    assert payload["calculateType"] == 1


def test_parse_response_rejects_string_nonzero_code():
    client = KiriClient(api_key="test-key")
    response = FakeResponse(
        status_code=200,
        payload={
            "ok": True,
            "code": "2009",
            "msg": "The video does not meet the requirements and cannot be uploaded",
            "data": {},
        },
    )

    try:
        client._parse_response(response)  # noqa: SLF001
    except KiriApiError as exc:
        assert exc.code == 2009
        assert "requirements" in str(exc)
    else:
        raise AssertionError("Expected KiriApiError for nonzero KIRI code")
