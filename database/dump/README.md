# database/dump

이 폴더는 데이터베이스 백업(dump) 파일을 보관하기 위한 디렉터리입니다. 운영/개발 환경의 데이터베이스 상태를 스냅샷 형태로 저장하고, 필요 시 이를 이용해 동일한 상태로 복구할 때 사용합니다.

## 포함되는 파일(예시)
- anabada_YYYYMMDD.sql: 전체 스키마+데이터 덤프
- schema_YYYYMMDD.sql: 스키마만 덤프
- seed_YYYYMMDD.sql: 초기 데이터(seeding)용 덤프

## 덤프 생성(Export)
- MySQL 예시:
  - 전체 덤프: `mysqldump -h <HOST> -u <USER> -p <DB_NAME> > anabada_YYYYMMDD.sql`
  - 스키마만: `mysqldump -h <HOST> -u <USER> -p --no-data <DB_NAME> > schema_YYYYMMDD.sql`
  - 데이터만: `mysqldump -h <HOST> -u <USER> -p --no-create-info <DB_NAME> > data_YYYYMMDD.sql`

## 덤프 복구(Import)
- MySQL 예시:
  - `mysql -h <HOST> -u <USER> -p <DB_NAME> < anabada_YYYYMMDD.sql`

## 파일명 규칙 권장
- `<type>_YYYYMMDD[_HHmm].sql` 형식 사용
  - 예: `anabada_20250115.sql`, `schema_20250115_0930.sql`

## 보안/주의 사항
- 실데이터(개인정보 포함 가능)가 담긴 덤프는 외부 유출에 각별히 주의하세요.
- 저장소에 커밋하지 말아야 할 덤프는 `.gitignore`에 추가하세요.
- 민감 정보는 마스킹/익명화된 seed 파일을 별도로 관리하는 것을 권장합니다.

## 용도 요약
- 개발용 로컬 DB 초기화, 테스트 데이터 재현, 장애 복구 등의 목적에 사용합니다.
