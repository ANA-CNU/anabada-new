/** 외부 시스템 오류를 호출자에게 안전하게 전달하기 위한 공통 기반 오류다. */
export abstract class BackendInfrastructureError extends Error {
  abstract readonly code: string;
  readonly operationId: string | undefined;
  protected constructor(message: string, operationId?: string) {
    super(message);
    this.operationId = operationId;
  }
}

export class DatabaseQueryError extends BackendInfrastructureError {
  readonly name = "DatabaseQueryError";
  readonly code = "database_query_failed";
  readonly vendorCode: "ER_DUP_ENTRY" | undefined;
  constructor(operationId: string, vendorCode?: "ER_DUP_ENTRY") {
    super("Database query failed", operationId);
    this.vendorCode = vendorCode;
  }
}
export class DatabaseContractError extends BackendInfrastructureError {
  readonly name = "DatabaseContractError";
  readonly code = "database_contract_invalid";
  constructor(operationId: string) {
    super("Database result violated its contract", operationId);
  }
}
export class DatabaseTransactionError extends BackendInfrastructureError {
  readonly name = "DatabaseTransactionError";
  readonly code = "database_transaction_failed";
  readonly failureCount: number;
  constructor(operationId?: string, failureCount = 1) {
    super("Database transaction failed", operationId);
    this.failureCount = failureCount;
  }
}
export class ClientInputError extends Error {
  readonly name = "ClientInputError";
  readonly code = "client_input_invalid";
  constructor() {
    super("Request input is invalid");
  }
}
