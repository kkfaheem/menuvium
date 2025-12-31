import urllib.request
import json
import uuid

API_URL = "http://localhost:8000"
TOKEN = "mock-token"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

def post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} {e.read().decode('utf-8')}")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def seed():
    # 1. Create Org
    org_name = "Seed Org " + str(uuid.uuid4())[:8]
    org_slug = org_name.lower().replace(" ", "-")
    print(f"Creating Org: {org_name}")
    
    org = post(f"{API_URL}/organizations/", {
        "name": org_name,
        "slug": org_slug,
        "owner_id": "mock-user"
    })
    
    if org:
        print(f"Org Created: {org['id']}")
        
        # 2. Create Location
        loc_name = "Seed Location"
        print(f"Creating Location: {loc_name}")
        loc = post(f"{API_URL}/organizations/{org['id']}/locations", {
            "name": loc_name,
            "address": "123 Seed St",
            "org_id": org['id']
        })
        
        if loc:
            print("Location Created.")
            return True
        else:
            print("Failed to create location")
    else:
        print("Failed to create org")
        
    return False

if __name__ == "__main__":
    seed()
