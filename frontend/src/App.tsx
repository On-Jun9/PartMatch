import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PartAutocomplete } from './components/PartAutocomplete';
import { PartMappingOverview } from './components/PartMappingOverview';
import { partApi, excelApi, type PartItem } from './api/client';

const queryClient = new QueryClient();

type ActiveTab = 'entry' | 'overview';

function AppContent() {
  const [partName, setPartName] = useState('');
  const [selectedParts, setSelectedParts] = useState<PartItem[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD 형식
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('entry');
  const [isCreatingPart, setIsCreatingPart] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [entryMessage, setEntryMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const extractErrorMessage = (error: unknown): string => {
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
  };

  const handleAddPart = async () => {
    const trimmedName = partName.trim();
    if (!trimmedName) {
      setEntryMessage({ type: 'error', text: '부품명을 입력해주세요.' });
      return;
    }

    setIsCreatingPart(true);
    setEntryMessage(null);
    try {
      const response = await partApi.createPart({ name: trimmedName });
      const canonicalName = response.part.name;
      setSelectedParts((prev) => [...prev, { name: canonicalName }]);
      try {
        await partApi.record(canonicalName, trimmedName);
      } catch (recordError) {
        console.warn('Failed to record part usage:', recordError);
      }
      setEntryMessage({ type: 'success', text: '정식 부품명을 추가했습니다.' });
      setPartName('');
    } catch (error) {
      const message = extractErrorMessage(error);
      if (message.includes('이미 동일한 정식 부품명이 존재합니다.')) {
        try {
          const [existing] = await partApi.search({ query: trimmedName, limit: 1 });
          const canonicalName = existing ? existing.name : trimmedName;
          setSelectedParts((prev) => [...prev, { name: canonicalName }]);
          try {
            await partApi.record(canonicalName, trimmedName);
          } catch (recordError) {
            console.warn('Failed to record part usage:', recordError);
          }
          setEntryMessage({
            type: 'success',
            text: '이미 존재하는 부품을 선택 목록에 추가했습니다.',
          });
          setPartName('');
        } catch (searchError) {
          setEntryMessage({ type: 'error', text: extractErrorMessage(searchError) });
        }
      } else {
        setEntryMessage({ type: 'error', text: message });
      }
    } finally {
      setIsCreatingPart(false);
    }
  };

  const handleRemovePart = (index: number) => {
    setSelectedParts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectExistingPart = (part: string) => {
    setSelectedParts((prev) => [...prev, { name: part }]);
    setPartName('');
    setEntryMessage(null);
  };

  const handleGenerateExcel = async () => {
    setIsGeneratingExcel(true);
    setEntryMessage(null);

    try {
      // API 호출하여 엑셀 파일 생성
      const blob = await excelApi.generate({
        items: selectedParts,
        vehicle_number: vehicleNumber.trim() || undefined,
        invoice_date: invoiceDate || undefined,
      });

      // Blob을 URL로 변환
      const url = window.URL.createObjectURL(blob);

      // 임시 링크 생성하여 다운로드
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `거래명세서_${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();

      // 정리
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setEntryMessage({ type: 'success', text: '엑셀 파일이 다운로드되었습니다.' });
    } catch (error) {
      const message = extractErrorMessage(error);
      setEntryMessage({ type: 'error', text: `엑셀 생성 실패: ${message}` });
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-10">
      <div className="mx-auto max-w-5xl px-4">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">PartMatch - 부품명 학습형 거래명세서</h1>
          <p className="mt-2 text-sm text-gray-600">
            자동완성 학습 데이터와 거래명세서 작성을 한 곳에서 관리하세요.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === 'entry'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white text-gray-600 shadow-sm hover:bg-gray-100'
            }`}
          >
            거래명세서 작성
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white text-gray-600 shadow-sm hover:bg-gray-100'
            }`}
          >
            부품 명칭 관리
          </button>
        </div>

        {activeTab === 'entry' ? (
          <div className="space-y-6">
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">거래명세서 정보</h2>
              <p className="mt-1 text-sm text-gray-500">
                거래명세서에 표시될 정보를 입력하세요.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="invoiceDate" className="mb-2 block text-sm font-medium text-gray-700">
                    날짜
                  </label>
                  <input
                    type="date"
                    id="invoiceDate"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="h-[42px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label htmlFor="vehicleNumber" className="mb-2 block text-sm font-medium text-gray-700">
                    차 번호 (귀하)
                  </label>
                  <input
                    type="text"
                    id="vehicleNumber"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="예: 12가3456"
                    className="h-[42px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">부품 추가</h2>
              <p className="mt-1 text-sm text-gray-500">
                부품명을 입력하면 유사한 정식 명칭을 추천합니다. 선택하면 학습 데이터에 반영됩니다.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <PartAutocomplete
                  value={partName}
                  onChange={setPartName}
                  onSelect={handleSelectExistingPart}
                  placeholder="부품명을 입력하세요 (예: 엔진오일, 부동액, 벨트)"
                />
                <button
                  type="button"
                  onClick={() => void handleAddPart()}
                  disabled={isCreatingPart}
                  className="whitespace-nowrap rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {isCreatingPart ? '추가 중...' : '추가'}
                </button>
              </div>
              {entryMessage && (
                <div
                  className={`mt-4 rounded-md border px-4 py-3 text-sm ${
                    entryMessage.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {entryMessage.text}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900">선택된 부품 목록</h2>
              {selectedParts.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">품목명</th>
                        <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">규격</th>
                        <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">수량</th>
                        <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">단가</th>
                        <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">공급가액</th>
                        <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {selectedParts.map((part, index) => {
                        const calculatedSupply = part.quantity && part.unit_price
                          ? part.quantity * part.unit_price
                          : null;
                        const displaySupply = part.supply_price ?? calculatedSupply;

                        return (
                          <tr key={`${part.name}-${index}`}>
                            <td className="px-3 py-3 font-medium text-gray-900">{part.name}</td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                value={part.specification || ''}
                                onChange={(e) => {
                                  const newParts = [...selectedParts];
                                  newParts[index] = { ...newParts[index], specification: e.target.value };
                                  setSelectedParts(newParts);
                                }}
                                placeholder="규격"
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                value={part.quantity || ''}
                                onChange={(e) => {
                                  const newParts = [...selectedParts];
                                  newParts[index] = { ...newParts[index], quantity: e.target.value ? Number(e.target.value) : null };
                                  setSelectedParts(newParts);
                                }}
                                placeholder="수량"
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                value={part.unit_price || ''}
                                onChange={(e) => {
                                  const newParts = [...selectedParts];
                                  newParts[index] = { ...newParts[index], unit_price: e.target.value ? Number(e.target.value) : null };
                                  setSelectedParts(newParts);
                                }}
                                placeholder="단가"
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                value={part.supply_price ?? ''}
                                onChange={(e) => {
                                  const newParts = [...selectedParts];
                                  newParts[index] = { ...newParts[index], supply_price: e.target.value ? Number(e.target.value) : null };
                                  setSelectedParts(newParts);
                                }}
                                placeholder={displaySupply ? `자동: ${displaySupply.toLocaleString()}` : '공급가액'}
                                className="w-28 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              {displaySupply && !part.supply_price && (
                                <div className="mt-1 text-xs text-gray-500">
                                  자동: {displaySupply.toLocaleString()}원
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => handleRemovePart(index)}
                                className="text-sm font-medium text-red-600 hover:text-red-700"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">
                    아직 선택된 부품이 없습니다. 위에서 부품을 추가해주세요.
                  </p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateExcel()}
                  disabled={isGeneratingExcel}
                  className="rounded-lg bg-green-500 px-6 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-green-300"
                >
                  {isGeneratingExcel ? '생성 중...' : '엑셀 생성'}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-gray-500 px-6 py-2 text-sm font-semibold text-white hover:bg-gray-600"
                >
                  인쇄
                </button>
              </div>
            </div>
          </div>
        ) : (
          <PartMappingOverview />
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
