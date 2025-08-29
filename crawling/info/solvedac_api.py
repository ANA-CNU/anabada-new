import os
import requests
from dotenv import load_dotenv

load_dotenv()
PROBLEM_TIER_API = os.getenv("PROBLEM_TIER_API")
USER_TIER_API = os.getenv("USER_TIER_API")

def problem_tier(problem_id):
    try:
        print(f"Requesting problem tier for ID: {problem_id}", flush=True)
        
        response = requests.get(
            url=f"{PROBLEM_TIER_API}?problemId={problem_id}",
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": "https://solved.ac/",
                "Origin": "https://solved.ac",
                "x-solvedac-language": "ko",
            },
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}", flush=True)
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data}", flush=True)
            return data.get("level")
        else:
            print(f"Error: Status {response.status_code}", flush=True)
            return None
            
    except Exception as e:
        print(f"Exception: {e}", flush=True)
        return None

def user_tier(username):
    try:
        print(f"Requesting user tier for: {username}", flush=True)
        
        response = requests.get(
            url=f"{USER_TIER_API}?handle={username}",
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": "https://solved.ac/",
                "Origin": "https://solved.ac",
            },
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}", flush=True)
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data}", flush=True)
            return data.get("tier")
        else:
            print(f"Error: Status {response.status_code}", flush=True)
            return None
            
    except Exception as e:
        print(f"Exception: {e}", flush=True)
        return None