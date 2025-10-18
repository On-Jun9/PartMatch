"""
RapidFuzz 기반 부품명 유사도 검색 엔진
"""
import re
from rapidfuzz import fuzz, process
from typing import List, Tuple, Dict
from sqlalchemy.orm import Session
from ..db import crud, models

class FuzzyPartMatcher:
    """부품명 유사도 매칭 클래스"""

    def __init__(self, threshold: int = 60):
        """
        Args:
            threshold: 최소 유사도 점수 (0-100)
        """
        self.threshold = threshold
        self._normalizer = re.compile(r"[^\w가-힣]+")

    def _normalize(self, text: str) -> str:
        """
        비교를 위한 정규화:
        - 소문자 변환
        - 공백/특수문자 제거
        """
        if not text:
            return ""
        return self._normalizer.sub("", text.lower())

    def search(
        self,
        query: str,
        candidates: List[str],
        limit: int = 10
    ) -> List[Tuple[str, float, int]]:
        """
        유사도 기반 검색

        Args:
            query: 검색할 문자열
            candidates: 후보 문자열 리스트
            limit: 최대 결과 개수

        Returns:
            [(문자열, 유사도 점수, 인덱스), ...] 리스트
        """
        if not query or not candidates:
            return []

        combined_scores: Dict[str, Tuple[float, int]] = {}

        def add_results(results: List[Tuple[str, float, int]]):
            for match, score, idx in results:
                if score < self.threshold:
                    continue
                existing = combined_scores.get(match)
                if not existing or existing[0] < score:
                    combined_scores[match] = (score, idx)

        configs = [
            {
                "query": query,
                "scorer": fuzz.WRatio,
                "processor": None,
            },
            {
                "query": query,
                "scorer": fuzz.token_set_ratio,
                "processor": None,
            },
            {
                "query": query,
                "scorer": fuzz.partial_ratio,
                "processor": None,
            },
            {
                "query": self._normalize(query),
                "scorer": fuzz.WRatio,
                "processor": self._normalize,
            },
        ]

        search_limit = max(limit * 3, 10)

        for config in configs:
            results = process.extract(
                config["query"],
                candidates,
                scorer=config["scorer"],
                processor=config["processor"],
                limit=search_limit,
            )
            add_results(results)

        sorted_results = sorted(
            combined_scores.items(),
            key=lambda item: item[1][0],
            reverse=True,
        )

        return [
            (match, score, idx)
            for match, (score, idx) in sorted_results[:limit]
        ]

    def search_parts_in_db(
        self,
        query: str,
        db: Session,
        limit: int = 10
    ) -> List[Dict]:
        """
        데이터베이스에서 부품명 유사도 검색

        Args:
            query: 검색할 부품명
            db: 데이터베이스 세션
            limit: 최대 결과 개수

        Returns:
            검색 결과 딕셔너리 리스트
        """
        # 모든 부품명과 별칭 수집
        all_parts = crud.get_all_parts(db)
        all_mappings = crud.get_all_mappings(db)

        # 검색 후보 준비
        candidates = []
        part_map = {}  # 문자열 -> Part 객체 매핑

        # 정식 부품명 추가
        for part in all_parts:
            candidates.append(part.name)
            part_map[part.name] = {
                "part": part,
                "is_alias": False,
                "mapping": None
            }

        # 별칭 추가
        for mapping in all_mappings:
            candidates.append(mapping.alias)
            part_map[mapping.alias] = {
                "part": mapping.part,
                "is_alias": True,
                "mapping": mapping
            }

        # 유사도 검색
        results = self.search(query, candidates, limit=limit * 2)  # 여유있게 가져오기

        # 결과 포매팅
        formatted_results = []
        seen_parts = set()  # 중복 제거

        for match_text, score, _ in results:
            info = part_map[match_text]
            part = info["part"]

            # 이미 추가된 부품은 스킵
            if part.id in seen_parts:
                continue

            seen_parts.add(part.id)

            # 사용 통계
            usage_count = len(part.usage_history)
            if part.usage_history:
                latest_history = max(part.usage_history, key=lambda history: history.created_at)
                last_used = latest_history.created_at.isoformat()
            else:
                last_used = None

            formatted_results.append({
                "name": part.name,
                "matched_text": match_text,
                "score": score / 100.0,  # 0-1 범위로 정규화
                "usage_count": usage_count,
                "last_used": last_used,
                "is_alias": info["is_alias"],
                "is_confirmed": part.is_confirmed,
            })

        # 점수와 사용 빈도를 조합하여 정렬
        # 점수가 높고, 사용 빈도가 높은 순
        formatted_results.sort(
            key=lambda x: (x["score"], x["usage_count"]),
            reverse=True
        )

        return formatted_results[:limit]

    def get_best_match(self, query: str, candidates: List[str]) -> str | None:
        """
        가장 유사한 하나의 항목 반환

        Args:
            query: 검색할 문자열
            candidates: 후보 문자열 리스트

        Returns:
            가장 유사한 문자열 또는 None
        """
        if not query or not candidates:
            return None

        result = process.extractOne(
            query,
            candidates,
            scorer=fuzz.ratio
        )

        if result and result[1] >= self.threshold:
            return result[0]

        return None


# 싱글톤 인스턴스
fuzzy_matcher = FuzzyPartMatcher(threshold=70)
