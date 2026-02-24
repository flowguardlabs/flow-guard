export enum BudgetPlanType {
  RECURRING = 'RECURRING',
  LINEAR_VESTING = 'LINEAR_VESTING',
  STEP_VESTING = 'STEP_VESTING',
}

export enum BudgetPlanStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}

export interface BudgetPlan {
  id: string;
  vaultId: string;
  vaultName?: string;
  planName?: string;
  planType: BudgetPlanType;
  recipient: string;
  recipientLabel?: string;
  totalAmount: number; // Total BCH to distribute
  intervalSeconds: number; // Time between releases
  amountPerInterval: number; // BCH per release
  cliffSeconds: number; // Optional cliff period (for vesting)
  totalReleased: number; // How much has been released
  nextUnlock?: Date; // When next unlock happens
  cliffDate?: Date; // When cliff ends
  startDate: Date; // When plan started
  status: BudgetPlanStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetPlanDto {
  vaultId: string;
  planName?: string;
  planType: BudgetPlanType;
  recipient: string;
  recipientLabel?: string;
  totalAmount: number;
  intervalSeconds: number;
  amountPerInterval: number;
  cliffSeconds?: number;
  startDate?: Date; // Optional, defaults to now
}
