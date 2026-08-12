export const Q_WORKFLOW_WITH_STEPS = `
query WorkflowWithSteps($id: uuid!) {
  workflows_by_pk(id: $id) {
    id
    org_id
    steps(order_by: { step_order: asc }) {
      id
      step_order
      type
      name
      config
    }
  }
}`;

export const Q_ORG_MEMBER_ROLE = `
query OrgMemberRole($org_id: uuid!, $user_id: uuid!) {
  org_members(where: { org_id: { _eq: $org_id }, user_id: { _eq: $user_id } }, limit: 1) {
    role
  }
}`;

export const Q_ORGANIZATION = `
query Organization($id: uuid!) {
  organizations_by_pk(id: $id) {
    id
    quota_calls_used
    quota_calls_allowed
    quota_period_start
  }
}`;

export const M_RESET_QUOTA_PERIOD = `
mutation ResetQuotaPeriod($id: uuid!, $period_start: date!) {
  update_organizations_by_pk(
    pk_columns: { id: $id }
    _set: { quota_calls_used: 0, quota_period_start: $period_start }
  ) {
    id
  }
}`;

export const M_INCREMENT_QUOTA = `
mutation IncrementQuota($id: uuid!, $by: Int!) {
  update_organizations(where: { id: { _eq: $id } }, _inc: { quota_calls_used: $by }) {
    affected_rows
  }
}`;

export const M_INSERT_WORKFLOW_RUN = `
mutation InsertWorkflowRun($workflow_id: uuid!, $trigger_type: trigger_type!, $triggered_by: uuid) {
  insert_workflow_runs_one(
    object: { workflow_id: $workflow_id, trigger_type: $trigger_type, triggered_by: $triggered_by, status: pending }
  ) {
    id
    org_id
    workflow_id
  }
}`;

export const Q_WORKFLOW_RUN = `
query WorkflowRun($id: uuid!) {
  workflow_runs_by_pk(id: $id) {
    id
    workflow_id
    org_id
    status
  }
}`;

export const M_UPDATE_WORKFLOW_RUN = `
mutation UpdateWorkflowRun($id: uuid!, $set: workflow_runs_set_input!) {
  update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
    id
    status
  }
}`;

export const Q_STEP_RUNS_FOR_RUN = `
query StepRunsForRun($workflow_run_id: uuid!) {
  step_runs(where: { workflow_run_id: { _eq: $workflow_run_id } }, order_by: { created_at: asc }) {
    id
    workflow_step_id
    status
    input
    output
    error
    attempt
  }
}`;

export const M_INSERT_STEP_RUN = `
mutation InsertStepRun($workflow_run_id: uuid!, $workflow_step_id: uuid!, $status: step_run_status!, $input: jsonb, $started_at: timestamptz!) {
  insert_step_runs_one(
    object: { workflow_run_id: $workflow_run_id, workflow_step_id: $workflow_step_id, status: $status, input: $input, started_at: $started_at }
  ) {
    id
  }
}`;

export const M_UPDATE_STEP_RUN = `
mutation UpdateStepRun($id: uuid!, $set: step_runs_set_input!) {
  update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
    id
    status
  }
}`;

export const Q_STEP_RUN_BY_PK = `
query StepRunByPk($id: uuid!) {
  step_runs_by_pk(id: $id) {
    id
    workflow_run_id
    workflow_step_id
    org_id
    status
  }
}`;

export const M_INSERT_WORKFLOW_OUTPUT = `
mutation InsertWorkflowOutput($workflow_run_id: uuid!, $step_run_id: uuid!, $data: jsonb!) {
  insert_workflow_outputs_one(object: { workflow_run_id: $workflow_run_id, step_run_id: $step_run_id, data: $data }) {
    id
  }
}`;

export const M_INSERT_NOTIFICATION = `
mutation InsertNotification($workflow_run_id: uuid!, $step_run_id: uuid!, $channel: String!, $message: String!) {
  insert_notifications_one(
    object: { workflow_run_id: $workflow_run_id, step_run_id: $step_run_id, channel: $channel, message: $message }
  ) {
    id
  }
}`;

export const M_MARK_NOTIFICATION_SENT = `
mutation MarkNotificationSent($id: uuid!, $sent_at: timestamptz!) {
  update_notifications_by_pk(pk_columns: { id: $id }, _set: { sent: true, sent_at: $sent_at }) {
    id
  }
}`;

export const Q_WORKFLOW_TRIGGER_BY_SECRET = `
query WebhookTrigger($workflow_id: uuid!) {
  workflow_triggers(where: { workflow_id: { _eq: $workflow_id }, type: { _eq: webhook }, enabled: { _eq: true } }, limit: 1) {
    id
    config
  }
}`;

export const Q_DATABASE_EVENT_TRIGGERS = `
query DatabaseEventTriggers($org_id: uuid!) {
  workflow_triggers(where: { org_id: { _eq: $org_id }, type: { _eq: database_event }, enabled: { _eq: true } }) {
    id
    workflow_id
    config
  }
}`;

export const Q_SCHEDULED_TRIGGERS = `
query ScheduledTriggers {
  workflow_triggers(where: { type: { _eq: scheduled }, enabled: { _eq: true } }) {
    id
    workflow_id
    config
  }
}`;

export const M_UPDATE_TRIGGER_CONFIG = `
mutation UpdateTriggerConfig($id: uuid!, $config: jsonb!) {
  update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { config: $config }) {
    id
  }
}`;

export const M_MARK_EXTERNAL_EVENT_PROCESSED = `
mutation MarkExternalEventProcessed($id: uuid!) {
  update_external_events_by_pk(pk_columns: { id: $id }, _set: { processed: true }) {
    id
  }
}`;

export const Q_USER_BY_EMAIL = `
query UserByEmail($email: citext!) {
  users(where: { email: { _eq: $email } }, limit: 1) {
    id
  }
}`;

export const M_UPSERT_ORG_MEMBER = `
mutation UpsertOrgMember($org_id: uuid!, $user_id: uuid!, $role: org_role!) {
  insert_org_members_one(
    object: { org_id: $org_id, user_id: $user_id, role: $role }
    on_conflict: { constraint: org_members_org_id_user_id_key, update_columns: [role] }
  ) {
    id
    org_id
    user_id
    role
  }
}`;
