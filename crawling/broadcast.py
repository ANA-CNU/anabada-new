import requests, os
from repository import db
from dotenv import load_dotenv
from logger import msg, warning, error, debug
load_dotenv()

def get_message (lotto: list[tuple]) : 
    message = [
        "추첨 결과가 바뀌었습니다.",
        f"{SITE_URL} 에서 자세히 확인하세요!",
        ""
    ]
    for i in range(min(10, len(lotto))):
        message.append(f"{i+1}. `{lotto[i][0]}`: {lotto[i][1]} 문제")
    # message.append("") # padding / deprecated / discord remove last empty line

    return message;

def broadcast(lotto : list[tuple]):
    message = get_message(lotto)

    header = {
        "Content-Type": "application/json",
    }

    content = {
        "content": "\n".join(message)
    }

    urls = db.get_all_urls()
    rejected_urls = []  # 비정상적인 웹훅 URL들을 저장할 리스트

    for id, url in urls:
        try:
            response = requests.post(url, headers=header, json=content, timeout=10)
            
            # HTTP 상태 코드가 2xx가 아니거나 특정 에러 응답인 경우
            if response.status_code < 200 or response.status_code >= 300:
                rejected_urls.append((id, url, f"HTTP_{response.status_code}"))
                continue
                
            # Discord API 에러 응답 확인
            try:
                discord_response = response.json()
                if 'code' in discord_response and discord_response['code'] in [10015, 50027, 50013, 10003]:
                    # 10015: Unknown Webhook
                    # 50027: Cannot send messages to this user
                    # 50013: Missing Permissions
                    # 10003: Unknown Channel
                    rejected_urls.append((id, url, f"Discord_{discord_response['code']}"))
                    continue
            except (ValueError, KeyError):
                # JSON 파싱 실패는 정상적인 경우일 수 있음
                pass
                
        except requests.exceptions.Timeout:
            warning(f"웹훅 타임아웃 (ID: {id}, URL: {url})")
            rejected_urls.append((id, url, "Timeout"))
        except requests.exceptions.ConnectionError:
            warning(f"웹훅 연결 실패 (ID: {id}, URL: {url})")
            rejected_urls.append((id, url, "ConnectionError"))
        except requests.exceptions.RequestException as e:
            error(f"웹훅 요청 실패 (ID: {id}, URL: {url}): {str(e)}")
            rejected_urls.append((id, url, f"RequestError_{str(e)}"))
        except Exception as e:
            error(f"웹훅 예상치 못한 에러 (ID: {id}, URL: {url}): {str(e)}")
            rejected_urls.append((id, url, f"UnexpectedError_{str(e)}"))

    # 비정상적인 웹훅 URL들을 DB에 저장하여 앞으로 무시하도록 함
    if rejected_urls:
        msg(f"총 {len(rejected_urls)}개의 비정상적인 웹훅을 발견했습니다.")
        try:
            db.set_url_ignored([id for id, url, _ in rejected_urls])
            msg("비정상적인 웹훅 URL들이 DB에 저장되었습니다.")
        except Exception as e:
            error(f"DB 저장 실패: {str(e)}")
    else:
        msg("모든 웹훅이 정상적으로 전송되었습니다.")