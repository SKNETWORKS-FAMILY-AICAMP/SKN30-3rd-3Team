import uuid
from datetime import datetime
from typing import List
from fastapi import APIRouter, status, Depends, HTTPException, Path
from supabase import Client
from app.auth.security import get_current_user
from app.db.session import get_supabase_client
from app.schemas.chat import PlantCareChatRequest, PlantCareChatResponse, Citation, ChatSession, ChatMessage

router = APIRouter(prefix="/chat", tags=["Plant Care RAG Chat"])

@router.post("/plant-care", response_model=PlantCareChatResponse, status_code=status.HTTP_200_OK, summary="식물 케어 RAG 상담 실행")
async def consult_plant_care(request: PlantCareChatRequest):
    """
    제공된 식물 ID, 최근 재배 일지, 업로드 사진을 기반으로 공공 원예 문서 RAG 모델을 구동하여 상태 진단 및 처방 가이드를 반환합니다. (Mock 데이터)
    """
    # 사용자의 질문 키워드에 따라 분기하여 적절한 Mock 데이터 응답
    question_lower = request.question.lower()
    
    if "노랗" in question_lower or "yellow" in question_lower or "잎 끝" in question_lower:
        return PlantCareChatResponse(
            summary="과습 또는 질소 부족으로 인한 잎 황화 현상 및 끝마름 증상 의심",
            possibleCauses=[
                "분 흙의 배수 불량 및 잦은 물주기로 인한 뿌리 호흡 장애 (과습)",
                "재배 기간 경과에 따른 토양 내 양분(특히 질소) 결핍",
                "실내 건조로 인한 잎 세포의 부분 탈수"
            ],
            todayActions=[
                "화분 흙의 겉 부분뿐만 아니라 손가락 한 마디 깊이까지 흙이 완전히 말랐는지 확인한 후 물을 주십시오.",
                "화분 밑 물받이에 고인 물은 뿌리 부패를 촉진하므로 즉시 비워주십시오.",
                "실내 습도 유지를 위해 잎 주변에 가볍게 분무를 해주거나 가습기를 가동하십시오."
            ],
            observationChecklist=[
                "새로 돋아나는 잎도 노랗게 변하는지 여부",
                "줄기 밑동 부분이 물러지거나 어두운 갈색으로 변하는지 여부",
                "흙 표면에 곰팡이가 생기거나 퀴퀴한 냄새가 나는지 점검"
            ],
            citations=[
                Citation(
                    sourceId="RAG-DOC-001",
                    title="실내정원 유지관리 가이드라인 - 물관리 요령",
                    url="https://www.nihhs.go.kr",
                    publisher="국립원예특작과학원"
                ),
                Citation(
                    sourceId="RAG-DOC-002",
                    title="농사로 실내식물 생리장해 대처법",
                    url="http://www.nongsaro.go.kr",
                    publisher="농촌진흥청"
                )
            ],
            safetyNotice="본 정보는 공식 문서에 기반한 관리 가이드라인일 뿐이며 특정 식물 병해충에 대한 법적 효력을 가진 확정 진단이 아닙니다. 증상이 지속되거나 악화될 경우 농업기술센터 전문가의 검진을 받으시기 바랍니다."
        )
    
    # 기본 Mock 응답
    return PlantCareChatResponse(
        summary="식물 관리 및 생육 상태 분석 보고",
        possibleCauses=[
            "계절적 환경 변화(조도 부족 또는 급격한 온도 변화)에 따른 적응 반응",
            "토양 영양 불균형 및 환기 부족"
        ],
        todayActions=[
            "통풍이 잘되는 밝은 반음지로 화분을 이동시켜 주십시오.",
            "물주기 전 흙 상태를 반드시 손가락으로 찔러보고 체크하십시오."
        ],
        observationChecklist=[
            "잎 뒷면에 응애나 진딧물 등의 미세 해충이 생겼는지 루페 또는 휴대폰 카메라 줌을 통해 확인하십시오.",
            "주 1회 평균 기온과 환기 횟수를 기록해 두십시오."
        ],
        citations=[
            Citation(
                sourceId="RAG-DOC-999",
                title="도시농업 병해충 및 생리장해 도감",
                url="http://www.nongsaro.go.kr",
                publisher="농촌진흥청"
            )
        ],
        safetyNotice="본 상담 결과는 입력하신 텍스트와 사진에 기반하여 참고용으로 생성되었습니다. 화학 농약을 살포하기 전 반드시 적용 대상을 확인하고 안전사용기준을 준수하십시오."
    )

@router.get("/sessions", response_model=List[ChatSession], summary="상담 세션 목록 조회")
async def list_chat_sessions(
    current_user_id: uuid.UUID = Depends(get_current_user),
    db: Client = Depends(get_supabase_client)
):
    try:
        response = db.table("chat_sessions").select("*").eq("user_id", str(current_user_id)).order("created_at", desc=True).execute()
        sessions = []
        for item in response.data:
            sessions.append(ChatSession(
                id=uuid.UUID(item["id"]),
                userId=uuid.UUID(item["user_id"]),
                plantId=uuid.UUID(item["plant_id"]) if item.get("plant_id") else None,
                createdAt=datetime.fromisoformat(item["created_at"])
            ))
        return sessions
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"상담 세션 목록 조회 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/sessions/{sessionId}/messages", response_model=List[ChatMessage], summary="세션별 대화 메시지 이력 조회")
async def list_chat_messages(
    sessionId: uuid.UUID = Path(..., description="세션 UUID"),
    current_user_id: uuid.UUID = Depends(get_current_user),
    db: Client = Depends(get_supabase_client)
):
    try:
        session_check = db.table("chat_sessions").select("user_id").eq("id", str(sessionId)).execute()
        if not session_check.data or session_check.data[0]["user_id"] != str(current_user_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="상담 세션을 찾을 수 없거나 해당 세션에 대한 권한이 없습니다."
            )
            
        response = db.table("chat_messages").select("*").eq("session_id", str(sessionId)).order("created_at", desc=False).execute()
        messages = []
        for item in response.data:
            citations_data = item.get("citations") or []
            citations = []
            for cit in citations_data:
                citations.append(Citation(
                    sourceId=cit.get("sourceId") or cit.get("source_id"),
                    title=cit.get("title"),
                    url=cit.get("url"),
                    publisher=cit.get("publisher")
                ))
                
            messages.append(ChatMessage(
                id=uuid.UUID(item["id"]),
                sessionId=uuid.UUID(item["session_id"]),
                sender=item["sender"],
                content=item["content"],
                citations=citations,
                createdAt=datetime.fromisoformat(item["created_at"])
            ))
        return messages
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"대화 메시지 조회 중 오류가 발생했습니다: {str(e)}"
        )
