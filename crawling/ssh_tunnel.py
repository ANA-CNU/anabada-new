import os
from contextlib import contextmanager
from sshtunnel import SSHTunnelForwarder
import logger

@contextmanager
def open_ssh_tunnel():
    """
    Open an SSH local port forwarder using environment variables.

    Required envs:
      SSH_HOST, SSH_PORT, SSH_USER, SSH_KEY
      SSH_LOCAL_PORT, SSH_REMOTE_PORT
    """
    host = os.getenv("SSH_HOST")
    port = int(os.getenv("SSH_PORT", "22"))
    user = os.getenv("SSH_USER")
    pkey_base64 = os.getenv("SSH_KEY_BASE64")
    local_port = int(os.getenv("SSH_LOCAL_PORT"))
    remote_port = int(os.getenv("SSH_REMOTE_PORT"))

    if not all([host, user, pkey_base64, local_port, remote_port]):
        raise RuntimeError("Missing SSH envs (SSH_HOST, SSH_USER, SSH_KEY, SSH_LOCAL_PORT, SSH_REMOTE_PORT)")

    import base64
    pkey = base64.b64decode(pkey_base64).decode("utf-8")

    logger.msg(pkey)

    # Write the provided key into a temp file to use with sshtunnel
    # sshtunnel expects a file path for pkey.
    import tempfile
    with tempfile.NamedTemporaryFile("w", delete=False) as f:
        f.write(pkey)
        key_path = f.name

    server = SSHTunnelForwarder(
        (host, port),
        ssh_username=user,
        ssh_pkey=key_path,
        remote_bind_address=("127.0.0.1", remote_port),
        local_bind_address=("0.0.0.0", local_port),
    )

    try:
        server.start()
        yield server
    finally:
        try:
            server.stop()
        finally:
            try:
                os.remove(key_path)
            except Exception:
                pass


