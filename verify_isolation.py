import urllib.request
import json
import uuid

API_URL = "http://localhost:8000"
TOKEN_USER_A = "mock-token-user-a"
TOKEN_USER_B = "mock-token-user-b"

def get_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def request(method, url, token, data=None):
    try:
        req = urllib.request.Request(
            url, 
            data=json.dumps(data).encode('utf-8') if data else None, 
            headers=get_headers(token), 
            method=method
        )
        with urllib.request.urlopen(req) as response:
            if response.status == 204:
                return {}
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        # print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
        return {"error": e.code, "detail": e.read().decode('utf-8')}
    except Exception as e:
        print(f"Error: {e}")
        return None

def run_test():
    print("--- Starting Isolation Verification ---")
    
    # 1. User A creates Org A, Loc A, Menu A
    print("\n[User A] Creating Infrastructure...")
    org_a = request("POST", f"{API_URL}/organizations/", TOKEN_USER_A, {
        "name": f"Org A {uuid.uuid4().hex[:4]}",
        "slug": f"org-a-{uuid.uuid4().hex[:4]}", 
        "owner_id": "user-a"
    })
    print(f"Org A: {org_a['id']}")
    
    loc_a = request("POST", f"{API_URL}/organizations/{org_a['id']}/locations", TOKEN_USER_A, {
        "name": "Loc A", 
        "address": "123 A St", 
        "org_id": org_a['id']
    })
    print(f"Loc A: {loc_a['id']}")
    
    menu_a = request("POST", f"{API_URL}/menus/", TOKEN_USER_A, {
        "name": "Menu A",
        "location_id": loc_a['id']
    })
    print(f"Menu A Response: {menu_a}")
    print(f"Menu A: {menu_a['id']}")
    
    # 2. User B creates Org B, Loc B, Menu B
    print("\n[User B] Creating Infrastructure...")
    org_b = request("POST", f"{API_URL}/organizations/", TOKEN_USER_B, {
        "name": f"Org B {uuid.uuid4().hex[:4]}",
        "slug": f"org-b-{uuid.uuid4().hex[:4]}", 
        "owner_id": "user-b"
    })
    print(f"Org B: {org_b['id']}")
    
    loc_b = request("POST", f"{API_URL}/organizations/{org_b['id']}/locations", TOKEN_USER_B, {
        "name": "Loc B", 
        "address": "456 B St", 
        "org_id": org_b['id']
    })
    print(f"Loc B: {loc_b['id']}")
    
    menu_b = request("POST", f"{API_URL}/menus/", TOKEN_USER_B, {
        "name": "Menu B",
        "location_id": loc_b['id']
    })
    print(f"Menu B: {menu_b['id']}")
    
    # 3. Verify Isolation
    print("\n[User A] Listing Menus for Loc A (Should see Menu A only)...")
    menus_a = request("GET", f"{API_URL}/menus/?location_id={loc_a['id']}", TOKEN_USER_A)
    print(f"Result: {[m['name'] for m in menus_a]}")
    if len(menus_a) == 1 and menus_a[0]['id'] == menu_a['id']:
        print("PASS: User A sees only Menu A.")
    else:
        print("FAIL: Isolation leak or listing error.")

    print("\n[User B] Listing Menus for Loc B (Should see Menu B only)...")
    menus_b = request("GET", f"{API_URL}/menus/?location_id={loc_b['id']}", TOKEN_USER_B)
    print(f"Result: {[m['name'] for m in menus_b]}")
    if len(menus_b) == 1 and menus_b[0]['id'] == menu_b['id']:
        print("PASS: User B sees only Menu B.")
    else:
        print("FAIL: Isolation leak or listing error.")
        
    print("\n[User B] Attempting to Delete Menu A (Should Fail 403/404)...")
    del_res = request("DELETE", f"{API_URL}/menus/{menu_a['id']}", TOKEN_USER_B)
    if 'error' in del_res and del_res['error'] in [403, 404]:
        print(f"PASS: Delete Rejected ({del_res['error']})")
    else:
        print(f"FAIL: User B deleted Menu A! Result: {del_res}")

if __name__ == "__main__":
    run_test()
