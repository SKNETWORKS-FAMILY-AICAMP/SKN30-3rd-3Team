import pytest
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.auth.security import get_current_user
from app.db.session import get_supabase_client

# 테스트용 고정 사용자 UUID
TEST_USER_ID = uuid.UUID("d3b07384-d113-49c3-a558-1ec114a84d41")

# Mock Supabase API 응답 클래스
class MockAPIResponse:
    def __init__(self, data):
        self.data = data

# Mock Supabase 테이블 조회/삽입 헬퍼 클래스
class MockSupabaseTable:
    def __init__(self, name):
        self.name = name
        self.queries = []

    def select(self, *args, **kwargs):
        self.queries.append(("select", args, kwargs))
        return self

    def eq(self, field, value):
        self.queries.append(("eq", field, value))
        return self

    def insert(self, data):
        self.queries.append(("insert", data))
        return self

    def or_(self, filter_str):
        self.queries.append(("or", filter_str))
        return self

    def execute(self):
        data = []
        if self.name == "plants":
            if any(q[0] == "select" for q in self.queries):
                data = [
                    {
                        "id": "d3b07384-d113-49c3-a558-1ec114a84d41",
                        "user_id": str(TEST_USER_ID),
                        "name": "몬스테라",
                        "species": "Monstera deliciosa",
                        "location": "거실 창가",
                        "sunlight": "간접광",
                        "created_at": "2026-06-01T12:00:00+00:00"
                    }
                ]
            elif any(q[0] == "insert" for q in self.queries):
                insert_val = next(q[1] for q in self.queries if q[0] == "insert")
                data = [
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": str(TEST_USER_ID),
                        "name": insert_val["name"],
                        "species": insert_val.get("species"),
                        "location": insert_val.get("location"),
                        "sunlight": insert_val.get("sunlight"),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                ]
        elif self.name == "care_logs":
            if any(q[0] == "insert" for q in self.queries):
                insert_val = next(q[1] for q in self.queries if q[0] == "insert")
                data = [
                    {
                        "id": str(uuid.uuid4()),
                        "plant_id": insert_val["plant_id"],
                        "watered_at": insert_val.get("watered_at"),
                        "leaf_condition": insert_val.get("leaf_condition"),
                        "soil_condition": insert_val.get("soil_condition"),
                        "memo": insert_val.get("memo"),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                ]
        elif self.name == "plant_photos":
            if any(q[0] == "insert" for q in self.queries):
                insert_val = next(q[1] for q in self.queries if q[0] == "insert")
                data = [
                    {
                        "id": str(uuid.uuid4()),
                        "plant_id": insert_val["plant_id"],
                        "storage_path": insert_val["storage_path"],
                        "note": insert_val.get("note"),
                        "captured_at": insert_val.get("captured_at"),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                ]
        elif self.name == "plant_catalog":
            mock_catalog = [
                {"id": "cat-001", "name": "몬스테라 델리시오사", "species": "Monstera deliciosa", "family_name": "천남성과", "description": "구멍 난 큰 잎"},
                {"id": "cat-002", "name": "인도고무나무", "species": "Ficus elastica", "family_name": "뽕나무과", "description": "두꺼운 광택 잎"},
                {"id": "cat-003", "name": "스킨답서스", "species": "Epipremnum aureum", "family_name": "천남성과", "description": "강인한 생명력"}
            ]
            data = mock_catalog
            or_query = next((q[1] for q in self.queries if q[0] == "or"), None)
            if or_query:
                import re
                matches = re.findall(r'%([^%]+)%', or_query)
                if matches:
                    search_term = matches[0].lower()
                    data = [
                        item for item in mock_catalog
                        if search_term in item["name"].lower() or search_term in item["species"].lower()
                    ]
        return MockAPIResponse(data)

class MockSupabaseStorageBucket:
    def __init__(self, bucket_name):
        self.bucket_name = bucket_name

    def create_signed_upload_url(self, path):
        return {
            "signed_url": f"https://mock-supabase.co/storage/v1/object/upload/sign/{self.bucket_name}/{path}?token=mock-token",
            "signedUrl": f"https://mock-supabase.co/storage/v1/object/upload/sign/{self.bucket_name}/{path}?token=mock-token",
            "token": "mock-token",
            "path": path
        }

class MockSupabaseStorage:
    def from_(self, bucket_name):
        return MockSupabaseStorageBucket(bucket_name)

class MockSupabaseClient:
    def __init__(self):
        self.storage = MockSupabaseStorage()

    def table(self, name):
        return MockSupabaseTable(name)

# FastAPI 의존성 주입 오버라이드
app.dependency_overrides[get_current_user] = lambda: TEST_USER_ID
app.dependency_overrides[get_supabase_client] = lambda: MockSupabaseClient()

# 글로벌 supabase 클라이언트 오버라이드
from app.db import session as db_session
db_session.supabase = MockSupabaseClient()

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_list_plants():
    response = client.get("/api/v1/plants")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert data[0]["name"] == "몬스테라"

def test_create_plant():
    payload = {
        "name": "홍바오",
        "species": "Ficus elastica",
        "location": "거실 안쪽",
        "sunlight": "반음지"
    }
    response = client.post("/api/v1/plants", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "홍바오"
    assert "id" in data
    assert "createdAt" in data

def test_create_care_log():
    plant_id = "d3b07384-d113-49c3-a558-1ec114a84d41"
    payload = {
        "wateredAt": "2026-06-25",
        "leafCondition": "잎 끝이 약간 노랗게 마름",
        "soilCondition": "손가락 마디 깊이까지 바짝 말라 있음",
        "memo": "최근 물 준지 10일 지남"
    }
    response = client.post(f"/api/v1/plants/{plant_id}/care-logs", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["leafCondition"] == "잎 끝이 약간 노랗게 마름"
    assert "id" in data
    assert data["plantId"] == plant_id

def test_create_plant_photo():
    plant_id = "d3b07384-d113-49c3-a558-1ec114a84d41"
    payload = {
        "storagePath": "users/d3b07384/plants/leaf_yellow.jpg",
        "capturedAt": "2026-06-29T12:00:00Z",
        "note": "클로즈업 촬영"
    }
    response = client.post(f"/api/v1/plants/{plant_id}/photos", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["storagePath"] == "users/d3b07384/plants/leaf_yellow.jpg"

def test_consult_plant_care():
    payload = {
        "plantId": "d3b07384-d113-49c3-a558-1ec114a84d41",
        "question": "잎 끝이 노랗게 변하는 이유가 뭘까요?"
    }
    response = client.post("/api/v1/chat/plant-care", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "possibleCauses" in data
    assert "todayActions" in data
    assert "safetyNotice" in data

def test_create_signed_upload_url():
    payload = {
        "fileName": "my_monstera.png",
        "mimeType": "image/png"
    }
    response = client.post("/api/v1/uploads/signed-url", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "signedUrl" in data
    assert "storagePath" in data
    assert data["storagePath"].startswith(f"users/{TEST_USER_ID}/plants/")
    assert data["storagePath"].endswith(".png")
    assert "token=mock-token" in data["signedUrl"]

def test_list_plant_catalog_all():
    response = client.get("/api/v1/plant-catalog")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    assert any(item["name"] == "몬스테라 델리시오사" for item in data)

def test_search_plant_catalog_by_name():
    response = client.get("/api/v1/plant-catalog?q=몬스")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "몬스테라 델리시오사"
    assert data[0]["species"] == "Monstera deliciosa"

def test_search_plant_catalog_by_species_case_insensitive():
    response = client.get("/api/v1/plant-catalog?q=FiCuS")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "인도고무나무"

def test_search_plant_catalog_no_match():
    response = client.get("/api/v1/plant-catalog?q=우주식물")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


