// Core data types for SurgeShield AI Agent System

/**
 * Chat message interface for conversation history
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * API request payload for chat endpoint
 */
export interface ChatRequest {
  message: string;
  sessionId?: string;
}

/**
 * API response payload from chat endpoint
 */
export interface ChatResponse {
  response: string;
  sessionId: string;
  error?: string;
}

/**
 * Hospital capacity data structure
 */
export interface HospitalCapacity {
  timestamp: string; // ISO 8601
  districts: Array<{
    district: string;
    facilities: Array<{
      name: string;
      totalBeds: number;
      occupiedBeds: number;
      availableBeds: number;
      occupancyPercentage: number;
    }>;
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    occupancyPercentage: number;
  }>;
}

/**
 * ML forecast data structure
 */
export interface MLForecast {
  timestamp: string;
  horizon: '7-day' | '14-day';
  districts: Array<{
    district: string;
    currentCases: number;
    predictedCases: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
}

/**
 * Pipeline status data structure
 */
export interface PipelineStatus {
  status: 'running' | 'completed' | 'failed' | 'idle';
  lastExecutionTime: string;
  lastSuccessTime: string;
  errorMessage?: string;
  modelPerformance?: {
    rmse: number;
    mae: number;
    r2: number;
  };
}

/**
 * Environmental data structure
 */
export interface EnvironmentalData {
  timestamp: string;
  districts: Array<{
    district: string;
    temperature: number; // Celsius
    rainfall: number; // mm
    humidity: number; // percentage
    transmissionRisk: 'high' | 'moderate' | 'low';
  }>;
}

/**
 * Risk assessment calculation result
 */
export interface RiskAssessment {
  district: string;
  currentCases: number;
  availableBeds: number;
  casesPerBed: number;
  riskLevel: 'Critical' | 'High' | 'Moderate' | 'Low';
  occupancyPercentage: number;
}

/**
 * Triage recommendation model
 */
export interface TriageRecommendation {
  district: string;
  priority: number; // 1 = highest
  riskLevel: 'Critical' | 'High' | 'Moderate' | 'Low';
  recommendedActions: Array<{
    action: 'bed_expansion' | 'staff_deployment' | 'patient_transfer' | 'resource_allocation';
    urgency: 'immediate' | 'high' | 'moderate';
    details: string;
  }>;
  targetFacilities?: string[];
}

/**
 * Session context model
 */
export interface SessionContext {
  sessionId: string;
  createdAt: string;
  lastAccessedAt: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  referencedEntities: {
    districts?: string[];
    facilities?: string[];
    metrics?: string[];
  };
}
