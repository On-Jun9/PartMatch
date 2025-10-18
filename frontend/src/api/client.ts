import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface PartSuggestion {
  name: string;
  score: number;
  usage_count: number;
  last_used: string | null;
  is_confirmed: boolean;
}

export interface PartAliasInfo {
  mapping_id: number;
  alias: string;
  confidence_score: number;
  usage_count: number;
  last_used: string | null;
}

export interface PartMappingInfo {
  part_id: number;
  name: string;
  description: string | null;
  is_confirmed: boolean;
  confirmed_at: string | null;
  usage_count: number;
  aliases: PartAliasInfo[];
}

export interface PartSearchRequest {
  query: string;
  limit?: number;
}

export interface UpdatePartPayload {
  name: string;
  description?: string | null;
  is_confirmed?: boolean;
}

export interface CreatePartPayload {
  name: string;
  description?: string | null;
  is_confirmed?: boolean;
}

export interface CreatePartResponse {
  message: string;
  part: PartMappingInfo;
}

export interface CreateAliasPayload {
  alias: string;
  confidence_score?: number;
}

export interface UpdateAliasPayload {
  alias?: string;
  confidence_score?: number;
}

export interface MergePartPayload {
  target_part_id?: number;
  target_part_name?: string;
}

export interface DeletePartResponse {
  message: string;
  part_id: number;
}

export const partApi = {
  search: async (request: PartSearchRequest): Promise<PartSuggestion[]> => {
    const response = await apiClient.post<PartSuggestion[]>('/parts/search', request);
    return response.data;
  },

  record: async (part_name: string, input_text?: string) => {
    const response = await apiClient.post('/parts/record', {
      part_name,
      input_text: input_text || part_name,
    });
    return response.data;
  },

  listMappings: async (): Promise<PartMappingInfo[]> => {
    const response = await apiClient.get<PartMappingInfo[]>('/parts/mappings');
    return response.data;
  },

  updatePart: async (partId: number, payload: UpdatePartPayload) => {
    const response = await apiClient.put(`/parts/${partId}`, payload);
    return response.data;
  },

  createPart: async (payload: CreatePartPayload): Promise<CreatePartResponse> => {
    const response = await apiClient.post<CreatePartResponse>('/parts', payload);
    return response.data;
  },

  mergePart: async (partId: number, payload: MergePartPayload) => {
    const body: Record<string, unknown> = {};
    if (payload.target_part_id !== undefined) {
      body.target_part_id = payload.target_part_id;
    }
    if (payload.target_part_name !== undefined) {
      body.target_part_name = payload.target_part_name;
    }
    const response = await apiClient.post(`/parts/${partId}/merge`, body);
    return response.data;
  },

  createAlias: async (partId: number, payload: CreateAliasPayload) => {
    const response = await apiClient.post(`/parts/${partId}/aliases`, payload);
    return response.data;
  },

  updateAlias: async (partId: number, mappingId: number, payload: UpdateAliasPayload) => {
    const body: Record<string, unknown> = {};
    if (payload.alias !== undefined) {
      body.alias = payload.alias;
    }
    if (payload.confidence_score !== undefined) {
      body.confidence_score = payload.confidence_score;
    }
    const response = await apiClient.put(`/parts/${partId}/aliases/${mappingId}`, body);
    return response.data;
  },

  deleteAlias: async (partId: number, mappingId: number) => {
    const response = await apiClient.delete(`/parts/${partId}/aliases/${mappingId}`);
    return response.data;
  },

  deletePart: async (partId: number): Promise<DeletePartResponse> => {
    const response = await apiClient.delete<DeletePartResponse>(`/parts/${partId}`);
    return response.data;
  },
};

export interface PartItem {
  name: string;
  specification?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  supply_price?: number | null;
  // 세액은 엑셀 템플릿의 수식으로 자동 계산됨
}

export interface GenerateExcelRequest {
  items: PartItem[];
  vehicle_number?: string;
  invoice_date?: string;
}

export const excelApi = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/excel/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  generate: async (request: GenerateExcelRequest): Promise<Blob> => {
    const response = await apiClient.post('/excel/generate', request, {
      responseType: 'blob',
    });
    return response.data;
  },
};
