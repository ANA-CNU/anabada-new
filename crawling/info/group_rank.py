import requests, os, time
from dotenv import load_dotenv
load_dotenv()

GROUP_RANK = os.getenv("GROUP_RANK")

def __get_user(html):
    arr = html.replace('<td>', '').split('</td>')
    name_first = arr[1].find('/user/') + 6
    name_end = arr[1].find('">', name_first)
    name = arr[1][name_first:name_end]

    correct = arr[3]
    correct_first = arr[3].find('>') + 1
    correct = arr[3].replace('</a>', '')[correct_first:]

    submission = arr[4]
    submission_first = arr[4].find('>') + 1
    submission = arr[4].replace('</a>', '')[submission_first:]
    return (name, int(correct), int(submission))

def get_group_member():
    return __get_group_member(1)

def __get_group_member(page=1):
    if page >= 3: return []
    
    response = requests.get(
        url = f'{GROUP_RANK}/{page}',
        headers = {
            "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
        },
    )

    html = response.text
    if html.find('error-v1-title') != -1:
        return []
    
    problem_first = html.find('id="ranklist"') + 13 # 13 letters
    problem_first = html.find('<tbody>', problem_first) + 7 # 7 letters
    problem_end = html.find('</tbody>', problem_first)
    html = html[problem_first:problem_end].replace('<tr>', '')
    arr = html.split('</tr>')
    arr.pop()

    people = []
    for e in arr:
        people.append(__get_user(e))

    if len(people) % 100 == 0:
        time.sleep(0.1)
        people = people + __get_group_member(page+1)
    return people

# people = get_group_member()
# print(len(people))
# print(*people, sep='\n')
# (name, corrects, submissions)