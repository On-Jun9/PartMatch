import { Fragment, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { partApi } from '../api/client';
import type { PartAliasInfo, PartMappingInfo } from '../api/client';

function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function formatLastUsed(lastUsed: string | null): string {
  if (!lastUsed) return '기록 없음';
  return new Date(lastUsed).toLocaleString();
}

function formatConfirmedAt(confirmedAt: string | null): string {
  if (!confirmedAt) return '확정 기록 없음';
  return new Date(confirmedAt).toLocaleString();
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const axiosError = error as {
      response?: { data?: { detail?: string; message?: string } };
      message?: string;
    };
    const detail = axiosError.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail;
    }
    const message = axiosError.response?.data?.message ?? axiosError.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return '요청 처리 중 오류가 발생했습니다.';
}

interface PartManagementPanelProps {
  part: PartMappingInfo;
  parts: PartMappingInfo[];
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
}

function PartManagementPanel({ part, parts, onClose, onRefresh }: PartManagementPanelProps) {
  const [nameInput, setNameInput] = useState(part.name);
  const [descriptionInput, setDescriptionInput] = useState(part.description ?? '');
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeSearchTerm, setMergeSearchTerm] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newAliasConfidence, setNewAliasConfidence] = useState('1');
  const [editingAliasId, setEditingAliasId] = useState<number | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasConfidenceInput, setAliasConfidenceInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUpdatingPart, setIsUpdatingPart] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isAddingAlias, setIsAddingAlias] = useState(false);
  const [isDeletingPart, setIsDeletingPart] = useState(false);
  const [aliasProcessingId, setAliasProcessingId] = useState<number | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(part.is_confirmed);

  useEffect(() => {
    setNameInput(part.name);
    setDescriptionInput(part.description ?? '');
    setIsConfirmed(part.is_confirmed);
    setEditingAliasId(null);
    setAliasInput('');
    setAliasConfidenceInput('');
    setNewAlias('');
    setNewAliasConfidence('1');
    setStatusMessage(null);
    setErrorMessage(null);
    setMergeTargetId(null);
    setMergeSearchTerm('');
  }, [part]);

  const availableTargets = useMemo(
    () => parts.filter((item) => item.part_id !== part.part_id),
    [parts, part.part_id],
  );

  useEffect(() => {
    const trimmed = mergeSearchTerm.trim().toLowerCase();
    if (!trimmed) {
      setMergeTargetId(null);
      return;
    }
    const exact = availableTargets.find(
      (item) => item.name.trim().toLowerCase() === trimmed,
    );
    setMergeTargetId(exact ? exact.part_id : null);
  }, [availableTargets, mergeSearchTerm]);

  const filteredTargets = useMemo(() => {
    const term = mergeSearchTerm.trim().toLowerCase();
    if (!term) {
      return availableTargets;
    }
    return availableTargets.filter((item) => item.name.trim().toLowerCase().includes(term));
  }, [availableTargets, mergeSearchTerm]);

  const handleUpdatePart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMessage('정식 부품명을 입력해주세요.');
      return;
    }

    setIsUpdatingPart(true);
    try {
      const descriptionValue = descriptionInput.trim();
      await partApi.updatePart(part.part_id, {
        name: trimmedName,
        description: descriptionValue ? descriptionValue : null,
        is_confirmed: isConfirmed,
      });
      await onRefresh();
      setStatusMessage('정식 부품명을 수정했습니다.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsUpdatingPart(false);
    }
  };

  const handleMerge = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedName = mergeSearchTerm.trim();
    if (!mergeTargetId && !trimmedName) {
      setErrorMessage('병합할 부품명을 검색하거나 직접 입력해주세요.');
      return;
    }

    const payload: { target_part_id?: number; target_part_name?: string } = {};
    if (mergeTargetId) {
      payload.target_part_id = mergeTargetId;
    } else if (trimmedName) {
      payload.target_part_name = trimmedName;
    }

    setIsMerging(true);
    try {
      await partApi.mergePart(part.part_id, payload);
      await onRefresh();
      setStatusMessage('정식 부품명을 병합했습니다.');
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMerging(false);
    }
  };

  const handleDeletePart = async () => {
    if (!window.confirm('정말로 이 정식 부품명을 삭제하시겠습니까? 연결된 별칭과 사용 이력도 함께 삭제됩니다.')) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsDeletingPart(true);
    try {
      await partApi.deletePart(part.part_id);
      await onRefresh();
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsDeletingPart(false);
    }
  };

  const handleAddAlias = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedAlias = newAlias.trim();
    if (!trimmedAlias) {
      setErrorMessage('별칭을 입력해주세요.');
      return;
    }

    let parsedConfidence = 1;
    const confidenceText = newAliasConfidence.trim();
    if (confidenceText) {
      const parsed = Number(confidenceText);
      if (Number.isNaN(parsed)) {
        setErrorMessage('신뢰도는 숫자로 입력해주세요.');
        return;
      }
      if (parsed < 0 || parsed > 1) {
        setErrorMessage('신뢰도는 0과 1 사이 값이어야 합니다.');
        return;
      }
      parsedConfidence = parsed;
    }

    setIsAddingAlias(true);
    try {
      await partApi.createAlias(part.part_id, {
        alias: trimmedAlias,
        confidence_score: parsedConfidence,
      });
      await onRefresh();
      setStatusMessage('별칭을 추가했습니다.');
      setNewAlias('');
      setNewAliasConfidence('1');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsAddingAlias(false);
    }
  };

  const startEditAlias = (alias: PartAliasInfo) => {
    setEditingAliasId(alias.mapping_id);
    setAliasInput(alias.alias);
    setAliasConfidenceInput(alias.confidence_score.toString());
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const cancelEditAlias = () => {
    setEditingAliasId(null);
    setAliasInput('');
    setAliasConfidenceInput('');
  };

  const handleUpdateAlias = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingAliasId === null) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedAlias = aliasInput.trim();
    if (!trimmedAlias) {
      setErrorMessage('별칭을 입력해주세요.');
      return;
    }

    const payload: { alias?: string; confidence_score?: number } = {
      alias: trimmedAlias,
    };

    const confidenceText = aliasConfidenceInput.trim();
    if (confidenceText) {
      const parsed = Number(confidenceText);
      if (Number.isNaN(parsed)) {
        setErrorMessage('신뢰도는 숫자로 입력해주세요.');
        return;
      }
      if (parsed < 0 || parsed > 1) {
        setErrorMessage('신뢰도는 0과 1 사이 값이어야 합니다.');
        return;
      }
      payload.confidence_score = parsed;
    }

    setAliasProcessingId(editingAliasId);
    try {
      await partApi.updateAlias(part.part_id, editingAliasId, payload);
      await onRefresh();
      setStatusMessage('별칭을 수정했습니다.');
      setEditingAliasId(null);
      setAliasInput('');
      setAliasConfidenceInput('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setAliasProcessingId(null);
    }
  };

  const handleDeleteAlias = async (mappingId: number) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setAliasProcessingId(mappingId);
    try {
      await partApi.deleteAlias(part.part_id, mappingId);
      await onRefresh();
      setStatusMessage('별칭을 삭제했습니다.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setAliasProcessingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{part.name}</h3>
          <p className="text-sm text-gray-600">
            {part.description || '정식 부품명과 별칭 정보를 관리하세요.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 font-medium">
              사용 {part.usage_count}회
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 font-medium">
              별칭 {part.aliases.length}개
            </span>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium ${
                isConfirmed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {isConfirmed ? '확정됨' : '검토 필요'}
            </span>
            {isConfirmed && part.confirmed_at && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 font-medium text-emerald-600">
                확정일 {formatConfirmedAt(part.confirmed_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDeletePart}
            disabled={isDeletingPart}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
          >
            {isDeletingPart ? '삭제 중...' : '부품 삭제'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            닫기
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      {statusMessage && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleUpdatePart}
          className="rounded-lg border border-gray-200 bg-gray-50 p-5"
        >
          <h4 className="text-base font-semibold text-gray-900">정식 부품명 수정</h4>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="edit-part-name">
                정식 부품명
              </label>
              <input
                id="edit-part-name"
                type="text"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium text-gray-600"
                htmlFor="edit-part-description"
              >
                설명 (선택)
              </label>
              <textarea
                id="edit-part-description"
                value={descriptionInput}
                onChange={(event) => setDescriptionInput(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                <input
                  type="checkbox"
                  checked={isConfirmed}
                  onChange={(event) => setIsConfirmed(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                정식 부품명 확정
              </label>
              <p className="mt-1 text-[11px] text-gray-500">
                {isConfirmed
                  ? part.confirmed_at
                    ? `확정일: ${formatConfirmedAt(part.confirmed_at)}`
                    : '저장 시 확정일이 기록됩니다.'
                  : '확정되지 않은 부품으로 표시됩니다.'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={isUpdatingPart}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isUpdatingPart ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h4 className="text-base font-semibold text-gray-900">정식 부품명 병합</h4>
          <p className="mt-1 text-xs text-gray-500">
            병합할 정식 부품명을 검색하거나 직접 입력하세요. 존재하지 않으면 새 정식 부품이 생성됩니다.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <input
                type="text"
                value={mergeSearchTerm}
                onChange={(event) => setMergeSearchTerm(event.target.value)}
                placeholder="병합 대상 정식 부품명을 입력하세요"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <p className="mt-2 text-[11px] text-gray-500">
                입력한 명칭과 동일한 부품이 있으면 그 부품으로 병합되고, 없으면 새 부품을 생성합니다.
              </p>
            </div>
            {availableTargets.length > 0 && (
              <div className="rounded-md border border-gray-200">
                <div className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">
                  검색 결과 ({filteredTargets.length}건)
                </div>
                {filteredTargets.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-500">
                    일치하는 부품이 없습니다. 새 이름으로 병합하려면 그대로 진행하세요.
                  </p>
                ) : (
                  <ul className="max-h-44 overflow-y-auto">
                    {filteredTargets.map((item) => (
                      <li key={item.part_id}>
                        <button
                          type="button"
                          onClick={() => setMergeSearchTerm(item.name)}
                          className={`flex w-full items-start justify-between px-3 py-2 text-left text-sm transition ${
                            mergeTargetId === item.part_id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'
                          }`}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="text-xs text-gray-500">
                            사용 {item.usage_count}회 · 별칭 {item.aliases.length}개
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            병합 시 현재 부품의 사용 이력과 별칭이 선택된 부품으로 이동하며, 현재 부품은 삭제됩니다.
          </p>
          <button
            type="button"
            onClick={handleMerge}
            disabled={isMerging}
            className="mt-4 w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {isMerging ? '병합 중...' : '병합 실행'}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleAddAlias}
          className="rounded-lg border border-gray-200 bg-gray-50 p-5"
        >
          <h4 className="text-base font-semibold text-gray-900">새 별칭 추가</h4>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="alias-name">
                별칭
              </label>
              <input
                id="alias-name"
                type="text"
                value={newAlias}
                onChange={(event) => setNewAlias(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="alias-confidence">
                신뢰도 (0 ~ 1)
              </label>
              <input
                id="alias-confidence"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={newAliasConfidence}
                onChange={(event) => setNewAliasConfidence(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={isAddingAlias}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {isAddingAlias ? '추가 중...' : '별칭 추가'}
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold text-gray-900">등록된 별칭</h4>
            <span className="text-xs text-gray-500">총 {part.aliases.length}건</span>
          </div>
          <div className="mt-4 space-y-3">
            {part.aliases.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 별칭이 없습니다.</p>
            ) : (
              part.aliases.map((alias) => (
                <div
                  key={alias.mapping_id}
                  className="rounded-md border border-gray-200 bg-white p-4"
                >
                  {editingAliasId === alias.mapping_id ? (
                    <form onSubmit={handleUpdateAlias} className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600">별칭</label>
                        <input
                          type="text"
                          value={aliasInput}
                          onChange={(event) => setAliasInput(event.target.value)}
                          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600">
                          신뢰도 (0 ~ 1)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={aliasConfidenceInput}
                          onChange={(event) => setAliasConfidenceInput(event.target.value)}
                          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={aliasProcessingId === alias.mapping_id}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                          {aliasProcessingId === alias.mapping_id ? '저장 중...' : '저장'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditAlias}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
                        >
                          취소
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{alias.alias}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                            신뢰도 {formatConfidence(alias.confidence_score)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                            사용 {alias.usage_count}회
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                            최근 {formatLastUsed(alias.last_used)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditAlias(alias)}
                          className="rounded-md border border-blue-200 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          편집
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAlias(alias.mapping_id)}
                          disabled={aliasProcessingId === alias.mapping_id}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {aliasProcessingId === alias.mapping_id ? '삭제 중...' : '삭제'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PartMappingOverview() {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmFilter, setConfirmFilter] = useState<'all' | 'confirmed' | 'pending'>('all');
  const [expandedPartId, setExpandedPartId] = useState<number | null>(null);
  const [showAddPartForm, setShowAddPartForm] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartDescription, setNewPartDescription] = useState('');
  const [newPartIsConfirmed, setNewPartIsConfirmed] = useState(false);
  const [isCreatingPart, setIsCreatingPart] = useState(false);
  const [overviewMessage, setOverviewMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<PartMappingInfo[]>({
    queryKey: ['part-mappings'],
    queryFn: partApi.listMappings,
  });

  const handleAddNewPart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOverviewMessage(null);

    const trimmedName = newPartName.trim();
    if (!trimmedName) {
      setOverviewMessage({ type: 'error', text: '정식 부품명을 입력해주세요.' });
      return;
    }

    setIsCreatingPart(true);
    try {
      const descriptionValue = newPartDescription.trim();
      await partApi.createPart({
        name: trimmedName,
        description: descriptionValue || null,
        is_confirmed: newPartIsConfirmed,
      });
      await refetch();
      setOverviewMessage({ type: 'success', text: '정식 부품명을 추가했습니다.' });
      setNewPartName('');
      setNewPartDescription('');
      setNewPartIsConfirmed(false);
      setShowAddPartForm(false);
    } catch (error) {
      const message = getErrorMessage(error);
      setOverviewMessage({ type: 'error', text: message });
    } finally {
      setIsCreatingPart(false);
    }
  };

  const filtered = useMemo(() => {
    if (!data) {
      return [];
    }

    let result = data;

    // 확정 상태 필터
    if (confirmFilter === 'confirmed') {
      result = result.filter((item) => item.is_confirmed);
    } else if (confirmFilter === 'pending') {
      result = result.filter((item) => !item.is_confirmed);
    }

    // 검색어 필터
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter((item) => {
        if (item.name.toLowerCase().includes(term)) {
          return true;
        }
        return item.aliases.some((alias) => alias.alias.toLowerCase().includes(term));
      });
    }

    return result;
  }, [data, searchTerm, confirmFilter]);

  const expandedPart = useMemo(() => {
    if (expandedPartId === null || !data) {
      return null;
    }
    return data.find((item) => item.part_id === expandedPartId) ?? null;
  }, [data, expandedPartId]);

  useEffect(() => {
    if (expandedPartId === null || !data) {
      return;
    }
    const exists = data.some((item) => item.part_id === expandedPartId);
    if (!exists) {
      setExpandedPartId(null);
    }
  }, [data, expandedPartId]);

  return (
    <div className="relative rounded-lg bg-white p-6 shadow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">부품 명칭 관리</h2>
          <p className="mt-1 text-sm text-gray-500">
            정식 부품명과 등록된 별칭, 사용 빈도 데이터를 한눈에 확인하고 관리하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowAddPartForm(!showAddPartForm);
              setOverviewMessage(null);
            }}
            className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-100"
          >
            {showAddPartForm ? '추가 취소' : '새 부품 추가'}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-100"
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="mapping-search">
            부품명 또는 별칭 검색
          </label>
          <input
            id="mapping-search"
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="예: 엔진, 벨트, 체인지"
            className="h-[42px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="confirm-filter">
            확정 상태
          </label>
          <select
            id="confirm-filter"
            value={confirmFilter}
            onChange={(event) => setConfirmFilter(event.target.value as 'all' | 'confirmed' | 'pending')}
            className="h-[42px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="all">전체</option>
            <option value="confirmed">확정됨</option>
            <option value="pending">검토 필요</option>
          </select>
        </div>
      </div>

      {showAddPartForm && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="text-base font-semibold text-emerald-900">새 부품 추가</h3>
          <p className="mt-1 text-xs text-emerald-700">
            새로운 정식 부품명을 추가하세요. 명세서 작성 시 자동완성에 사용됩니다.
          </p>
          <form onSubmit={handleAddNewPart} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700" htmlFor="new-part-name">
                정식 부품명 *
              </label>
              <input
                id="new-part-name"
                type="text"
                value={newPartName}
                onChange={(event) => setNewPartName(event.target.value)}
                placeholder="예: 엔진오일, 브레이크패드, 타이밍벨트"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700" htmlFor="new-part-description">
                설명 (선택)
              </label>
              <textarea
                id="new-part-description"
                value={newPartDescription}
                onChange={(event) => setNewPartDescription(event.target.value)}
                placeholder="부품에 대한 간단한 설명을 입력하세요"
                rows={2}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={newPartIsConfirmed}
                  onChange={(event) => setNewPartIsConfirmed(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                정식 부품명 확정
              </label>
              <p className="mt-1 text-[11px] text-gray-600">
                확정된 부품은 자동완성 시 우선 표시됩니다.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddPartForm(false);
                  setNewPartName('');
                  setNewPartDescription('');
                  setNewPartIsConfirmed(false);
                  setOverviewMessage(null);
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isCreatingPart}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isCreatingPart ? '추가 중...' : '추가'}
              </button>
            </div>
          </form>
        </div>
      )}

      {overviewMessage && (
        <div
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            overviewMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {overviewMessage.text}
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">데이터를 불러오는 중입니다...</p>}
      {isError && (
        <p className="text-sm text-red-500">
          데이터를 불러오지 못했습니다. 백엔드 서버 상태를 확인한 뒤 다시 시도하세요.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500">조건과 일치하는 데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '50%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '17%' }} />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      정식 부품명
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      등록된 별칭
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      사용 횟수
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filtered.map((item) => (
                    <Fragment key={item.part_id}>
                      <tr
                        className={`transition ${expandedPartId === item.part_id ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="font-medium text-gray-900 break-words">{item.name}</div>
                          {item.description && (
                            <div className="mt-1 text-xs text-gray-500 break-words">{item.description}</div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                item.is_confirmed
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {item.is_confirmed ? '확정됨' : '검토 필요'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {item.aliases.length === 0 ? (
                            <span className="text-xs text-gray-400">등록된 별칭 없음</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {item.aliases.slice(0, 6).map((alias) => (
                                <div
                                  key={alias.mapping_id}
                                  className="min-w-0 flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                                >
                                  <div className="text-sm font-medium text-gray-900 break-words">{alias.alias}</div>
                                  <div className="mt-1 text-[11px] text-gray-600 whitespace-nowrap">
                                    신뢰도 {formatConfidence(alias.confidence_score)} · 사용 {alias.usage_count}회
                                  </div>
                                </div>
                              ))}
                              {item.aliases.length > 6 && (
                                <div className="flex items-center">
                                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                                    +{item.aliases.length - 6}개
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="text-base font-semibold text-gray-900">{item.usage_count}회</div>
                          <div className="text-xs text-gray-500">별칭 {item.aliases.length}개</div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPartId((current) =>
                                current === item.part_id ? null : item.part_id,
                              )
                            }
                            className="whitespace-nowrap rounded-full border border-blue-200 px-4 py-1.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                          >
                            {expandedPartId === item.part_id ? '접기' : '상세 관리'}
                          </button>
                        </td>
                      </tr>
                      {expandedPartId === item.part_id && expandedPart && (
                        <tr className="bg-gray-50">
                          <td colSpan={4} className="px-5 pb-6 pt-2">
                            <PartManagementPanel
                              part={expandedPart}
                              parts={data}
                              onClose={() => setExpandedPartId(null)}
                              onRefresh={() => refetch()}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

    </div>
  );
}
