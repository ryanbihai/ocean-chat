"""OceanBus L0 HTTP client + L1 request helper."""
import json
import time
import random
import string
import httpx

L0_BASE = "https://ai-t.ihaola.com.cn/api/l0"
YP_OPENID = "YwvQeEb8X9b394wKxetJ06EV9w5IIglMlucJmbb_gwLbBg_dB50NyB7SYdxBAIObSjdPNprkooxZ3icV"
REP_OPENID = "vh25CCGnIIpN-b2A0yA46kiHEmeoeBf9cMPCwvtBPThgHHG8MT3TbXEyBJF-0VmSflBR2Kno4k5zIquw"


def _rand(n=8):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def _auth(api_key):
    return {"Authorization": f"Bearer {api_key}"}


def l0_register(api_key):
    resp = httpx.post(f"{L0_BASE}/agents/register", json={}, timeout=15)
    return resp.json()


def l0_get_me(api_key):
    resp = httpx.get(f"{L0_BASE}/agents/me", headers=_auth(api_key), timeout=15)
    return resp.json()


def l0_send_message(api_key, to_openid, content):
    client_msg_id = f"dify_{int(time.time() * 1000)}_{_rand()}"
    resp = httpx.post(
        f"{L0_BASE}/messages",
        json={"to_openid": to_openid, "client_msg_id": client_msg_id, "content": content},
        headers=_auth(api_key),
        timeout=15,
    )
    return resp.json()


def l0_sync(api_key, since_seq, limit):
    resp = httpx.get(
        f"{L0_BASE}/messages/sync",
        params={"since_seq": since_seq, "limit": limit},
        headers=_auth(api_key),
        timeout=15,
    )
    return resp.json()


def l0_block(api_key, from_openid):
    resp = httpx.post(
        f"{L0_BASE}/messages/block",
        json={"from_openid": from_openid},
        headers=_auth(api_key),
        timeout=15,
    )
    return resp.json()


def l1_request(api_key, l1_openid, action, params, timeout=20):
    """Send a message to an L1 agent, then poll for the reply."""
    request_id = f"req_{int(time.time() * 1000)}_{_rand()}"
    payload = {"action": action, "request_id": request_id}
    payload.update(params)

    since_seq = 0
    try:
        snap = l0_sync(api_key, 0, 10)
        msgs = snap.get("data", {}).get("messages", [])
        if msgs:
            since_seq = max(m["seq_id"] for m in msgs)
    except Exception:
        pass

    l0_send_message(api_key, l1_openid, json.dumps(payload))

    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(0.8)
        try:
            data = l0_sync(api_key, since_seq, 10)
            msgs = data.get("data", {}).get("messages", [])
            for m in msgs:
                since_seq = max(since_seq, m.get("seq_id", 0))
                try:
                    body = json.loads(m.get("content", "{}"))
                    if body.get("request_id") == request_id:
                        return body
                except (json.JSONDecodeError, TypeError):
                    continue
        except Exception:
            continue

    return {"code": -1, "msg": "L1 service timeout — please retry"}
