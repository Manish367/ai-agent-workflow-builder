import { gql } from "@apollo/client";

export const MY_ORGS = gql`
  query MyOrgs($user_id: uuid!) {
    org_members(where: { user_id: { _eq: $user_id } }) {
      org_id
      role
      organization {
        id
        name
      }
    }
  }
`;

export const ORG_STATS = gql`
  query OrgStats($org_id: uuid!) {
    organizations_by_pk(id: $org_id) {
      id
      name
      quota_calls_used
      quota_calls_allowed
      quota_period_start
    }
    organization_stats(where: { org_id: { _eq: $org_id } }) {
      runs_this_month
      avg_run_duration_seconds
    }
  }
`;

export const ORG_WORKFLOWS = gql`
  query OrgWorkflows($org_id: uuid!) {
    workflows(where: { org_id: { _eq: $org_id } }, order_by: { created_at: desc }) {
      id
      name
      description
      created_at
      steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        name
        config
      }
      triggers {
        id
        type
        config
        enabled
      }
      runs(order_by: { created_at: desc }, limit: 1) {
        id
        status
        trigger_type
        started_at
        finished_at
        created_at
      }
    }
  }
`;

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($org_id: uuid!, $name: String!, $description: String) {
    insert_workflows_one(object: { org_id: $org_id, name: $name, description: $description }) {
      id
      name
    }
  }
`;

export const ADD_STEP = gql`
  mutation AddStep($workflow_id: uuid!, $step_order: Int!, $type: step_type!, $name: String!, $config: jsonb!) {
    insert_workflow_steps_one(
      object: { workflow_id: $workflow_id, step_order: $step_order, type: $type, name: $name, config: $config }
    ) {
      id
    }
  }
`;

export const ADD_TRIGGER = gql`
  mutation AddTrigger($workflow_id: uuid!, $type: trigger_type!, $config: jsonb!) {
    insert_workflow_triggers_one(object: { workflow_id: $workflow_id, type: $type, config: $config }) {
      id
    }
  }
`;

export const UPDATE_STEP_ORDER = gql`
  mutation UpdateStepOrder($id: uuid!, $step_order: Int!) {
    update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: { step_order: $step_order }) {
      id
    }
  }
`;

export const DELETE_TRIGGER = gql`
  mutation DeleteTrigger($id: uuid!) {
    delete_workflow_triggers_by_pk(id: $id) {
      id
    }
  }
`;

export const DELETE_STEP = gql`
  mutation DeleteStep($id: uuid!) {
    delete_workflow_steps_by_pk(id: $id) {
      id
    }
  }
`;

export const TRIGGER_RUN = gql`
  mutation TriggerRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      workflow_run_id
      status
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: uuid!, $approve: Boolean!) {
    approveStep(step_run_id: $step_run_id, approve: $approve) {
      step_run_id
      workflow_run_id
      status
    }
  }
`;

// A subscription may only have one root field, so run status rides along on the workflow_run relationship instead of a second root field.
export const STEP_RUN_PROGRESS = gql`
  subscription StepRunProgress($workflow_run_id: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $workflow_run_id } }, order_by: { created_at: asc }) {
      id
      workflow_step_id
      status
      input
      output
      error
      attempt
      approved_by
      approved_at
      started_at
      finished_at
      workflow_step {
        type
        name
        step_order
      }
      workflow_run {
        id
        status
        started_at
        finished_at
      }
    }
  }
`;

export const SIMULATE_EXTERNAL_EVENT = gql`
  mutation SimulateExternalEvent($org_id: uuid!, $payload: jsonb!) {
    insert_external_events_one(object: { org_id: $org_id, source: "demo-ui", payload: $payload }) {
      id
    }
  }
`;

export const MY_ROLE_IN_ORG = gql`
  query MyRoleInOrg($org_id: uuid!, $user_id: uuid!) {
    org_members(where: { org_id: { _eq: $org_id }, user_id: { _eq: $user_id } }, limit: 1) {
      role
    }
  }
`;

export const WORKFLOW_DETAIL = gql`
  query WorkflowDetail($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name
      description
      steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        name
        config
      }
      triggers {
        id
        type
        config
        enabled
      }
      runs(order_by: { created_at: desc }, limit: 10) {
        id
        status
        trigger_type
        started_at
        finished_at
        created_at
      }
    }
  }
`;

export const ORG_MEMBERS = gql`
  query OrgMembers($org_id: uuid!) {
    org_members(where: { org_id: { _eq: $org_id } }) {
      id
      user_id
      role
      user {
        id
        email
        displayName
      }
    }
  }
`;
