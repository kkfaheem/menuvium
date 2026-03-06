import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional


class EmailConfigError(RuntimeError):
    """Raised when SMTP/email delivery configuration is missing."""


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    host = (os.getenv("SMTP_HOST") or "").strip()
    from_email = (os.getenv("SMTP_FROM_EMAIL") or "").strip()
    from_name = (os.getenv("SMTP_FROM_NAME") or "Menuvium").strip()

    if not host or not from_email:
        raise EmailConfigError("SMTP is not configured")

    port_raw = (os.getenv("SMTP_PORT") or "587").strip()
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise EmailConfigError("SMTP_PORT must be a valid integer") from exc

    username = (os.getenv("SMTP_USERNAME") or "").strip() or None
    password = (os.getenv("SMTP_PASSWORD") or "").strip() or None

    use_ssl = _env_flag("SMTP_USE_SSL", False)
    use_starttls = _env_flag("SMTP_USE_TLS", True)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=20) as smtp:
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.ehlo()
        if use_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if username and password:
            smtp.login(username, password)
        smtp.send_message(message)
