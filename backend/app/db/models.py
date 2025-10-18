from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from . import Base

class Part(Base):
    """부품명 마스터 테이블"""
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    description = Column(String, nullable=True)
    is_confirmed = Column(Boolean, default=False, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 관계
    mappings = relationship("PartMapping", back_populates="part", cascade="all, delete-orphan")
    usage_history = relationship("PartUsageHistory", back_populates="part", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Part(id={self.id}, name='{self.name}')>"


class PartMapping(Base):
    """비정식 명칭 -> 정식 부품명 매핑 테이블"""
    __tablename__ = "part_mappings"

    id = Column(Integer, primary_key=True, index=True)
    alias = Column(String, nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    confidence_score = Column(Float, default=1.0)  # 매핑 신뢰도 (0.0 ~ 1.0)
    usage_count = Column(Integer, default=1)
    last_used = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 관계
    part = relationship("Part", back_populates="mappings")

    def __repr__(self):
        return f"<PartMapping(alias='{self.alias}', part='{self.part.name if self.part else None}')>"


class PartUsageHistory(Base):
    """부품명 사용 이력 테이블"""
    __tablename__ = "part_usage_history"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    input_text = Column(String, nullable=False)  # 사용자가 입력한 원본 텍스트
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # 관계
    part = relationship("Part", back_populates="usage_history")

    def __repr__(self):
        return f"<PartUsageHistory(input_text='{self.input_text}', part='{self.part.name if self.part else None}')>"
