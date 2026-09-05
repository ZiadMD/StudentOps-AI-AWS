from core.database import get_tenant_client

def log_audit_event(
    access_token: str,
    actor_id: str, 
    organization_id: str, 
    action: str, 
    request_id: str,
    target_id: str = None, 
    payload: dict = None
):
    """
    SECURITY: Logs critical state-changing actions.
    The database trigger will automatically compute the hash-chain preventing non-repudiation.
    """
    try:
        audit_data = {
            "actor_id": actor_id,
            "organization_id": organization_id,
            "action": action,
            "target_id": target_id,
            "payload": payload or {},
            "request_id": request_id
        }
        
        # Insert directly. DB enforces hash chain and rejects modifications.
        db = get_tenant_client(access_token)
        db.table("audit_logs").insert(audit_data).execute()
        
    except Exception as e:
        # We catch and print locally. In T9 (Telemetry), this routes to Sentry as a critical alert.
        print(f"CRITICAL: Failed to write audit log for action '{action}': {str(e)}")