import type { IAuthService, IDataService, IAIService } from './interfaces';
import { mockAuthService } from './mock/authService.mock';
import { mockDataService } from './mock/dataService.mock';
import { mockAiService } from './mock/aiService.mock';
import { hasSupabaseConfig } from './supabase/client';
import { supabaseAuthService } from './supabase/authService';
import { supabaseDataService } from './supabase/dataService';
import { supabaseAiService } from './supabase/aiService';

/**
 * 服务容器：UI 只从此处取服务，不直接 import 具体实现。
 *
 * 双模式设计：
 *   - 配置齐全且 VITE_USE_MOCK !== 'true' → 真实 Supabase 实现（RLS 数据隔离）
 *   - 否则 → mock 实现，网站仍可完整运行与演示
 *
 * 切换只改环境变量，页面代码零改动。
 */
export const useMock = import.meta.env.VITE_USE_MOCK === 'true' || !hasSupabaseConfig;

export const authService: IAuthService = useMock ? mockAuthService : supabaseAuthService;
export const dataService: IDataService = useMock ? mockDataService : supabaseDataService;
export const aiService: IAIService = useMock ? mockAiService : supabaseAiService;

export type { IAuthService, IDataService, IAIService } from './interfaces';
