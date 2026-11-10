/**
 * Types des lignes de la base de données (miroir des migrations SQL
 * dans supabase/migrations). Partagés entre le serveur et le client.
 */

export type UUID = string;
export type ISODateTime = string;

export type OrgRole = "super_admin" | "org_admin" | "group_leader" | "member" | "guest";
export type GroupRole = "leader" | "member" | "guest";

export interface Profile {
  id: UUID;
  email: string;
  display_name: string;
  timezone: string;
  locale: string;
  reminder_offsets: number[];
  travel_buffer_minutes: number;
  notify_email: boolean;
  delete_captures_after_analysis: boolean;
  theme: "system" | "light" | "dark";
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  created_by: UUID;
  created_at: ISODateTime;
}

export interface OrganizationMember {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: OrgRole;
  created_at: ISODateTime;
}

export interface Group {
  id: UUID;
  organization_id: UUID;
  name: string;
  description: string | null;
  color: string;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface GroupMember {
  id: UUID;
  group_id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: GroupRole;
  created_at: ISODateTime;
}

export type UploadKind = "image" | "pdf" | "text" | "ics";

export interface Upload {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  kind: UploadKind;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_path: string | null;
  original_name: string | null;
  deleted_at: ISODateTime | null;
  created_at: ISODateTime;
}

export type ExtractionStatus = "pending" | "processing" | "needs_review" | "completed" | "failed";
export type ExtractionStep = "received" | "analyzing" | "extracted" | "review" | "ready";

export interface ExtractionJob {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  upload_ids: UUID[];
  status: ExtractionStatus;
  step: ExtractionStep;
  provider: string | null;
  error: string | null;
  warnings: string[];
  context_notes: string | null;
  attempts: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  completed_at: ISODateTime | null;
}

export interface ExtractedEventRow {
  id: UUID;
  job_id: UUID;
  organization_id: UUID;
  user_id: UUID;
  position: number;
  raw: unknown;
  draft: unknown;
  status: "pending" | "created" | "rejected";
  event_id: UUID | null;
  created_at: ISODateTime;
}

export type EventStatus = "confirmed" | "tentative" | "cancelled";
export type Visibility = "private" | "group" | "organization";
export type EventSource = "manual" | "capture" | "ics" | "google" | "outlook";

export interface EventRow {
  id: UUID;
  organization_id: UUID;
  group_id: UUID | null;
  created_by: UUID;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  timezone: string;
  all_day: boolean;
  recurrence_rule: string | null;
  recurrence_until: ISODateTime | null;
  status: EventStatus;
  visibility: Visibility;
  source: EventSource;
  source_job_id: UUID | null;
  external_uid: string | null;
  version: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** Exception d'une occurrence d'événement récurrent (annulée ou déplacée). */
export interface EventOccurrence {
  id: UUID;
  event_id: UUID;
  organization_id: UUID;
  /** Début d'origine selon la règle de récurrence (clé de l'occurrence). */
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  status: EventStatus;
  /** { starts_at, ends_at } si l'occurrence a été déplacée. */
  overrides: { starts_at?: ISODateTime; ends_at?: ISODateTime };
  created_at: ISODateTime;
}

export type ParticipantStatus = "invited" | "accepted" | "tentative" | "declined" | "withdrawn";

export interface EventParticipant {
  id: UUID;
  event_id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: "organizer" | "participant";
  status: ParticipantStatus;
  responded_at: ISODateTime | null;
  created_at: ISODateTime;
}

export type InvitationStatus = "pending" | "accepted" | "declined" | "tentative" | "cancelled";

export interface Invitation {
  id: UUID;
  /** null pour une invitation à rejoindre l'organisation. */
  event_id: UUID | null;
  organization_id: UUID;
  invited_by: UUID;
  invitee_user_id: UUID | null;
  invitee_email: string | null;
  group_id: UUID | null;
  status: InvitationStatus;
  token_hash: string;
  responded_at: ISODateTime | null;
  /** Rôle attribué en rejoignant l'organisation (invitation d'organisation, ou invité externe). */
  org_role?: OrgRole | null;
  email_status?: "sent" | "failed" | "skipped" | null;
  email_error?: string | null;
  expires_at?: ISODateTime | null;
  created_at: ISODateTime;
}

export interface CalendarConnection {
  id: UUID;
  user_id: UUID;
  organization_id: UUID;
  provider: "google" | "outlook" | "zoom";
  account_email: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: ISODateTime | null;
  scopes: string[];
  calendar_id: string;
  status: "active" | "error" | "revoked";
  last_synced_at: ISODateTime | null;
  last_error: string | null;
  /** Canal de notifications de changements (webhook Google / abonnement Microsoft Graph). */
  watch_channel_id?: string | null;
  watch_resource_id?: string | null;
  watch_expires_at?: ISODateTime | null;
  created_at: ISODateTime;
}

export interface CalendarSyncRecord {
  id: UUID;
  connection_id: UUID;
  event_id: UUID;
  external_id: string;
  direction: "push" | "pull";
  external_updated_at: string | null;
  status: "synced" | "error" | "deleted";
  error: string | null;
  last_synced_at: ISODateTime;
}

export type ConflictKind = "full" | "partial" | "travel_buffer";
export type ConflictStatus = "open" | "resolved" | "postponed" | "dismissed";

export interface CalendarConflict {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  event_a_id: UUID;
  event_b_id: UUID;
  occurrence_a_start: ISODateTime;
  occurrence_a_end: ISODateTime;
  occurrence_b_start: ISODateTime;
  occurrence_b_end: ISODateTime;
  overlap_minutes: number;
  kind: ConflictKind;
  status: ConflictStatus;
  detected_at: ISODateTime;
  resolved_at: ISODateTime | null;
}

export type ResolutionAction =
  | "keep_a"
  | "keep_b"
  | "withdraw_a"
  | "withdraw_b"
  | "propose_slot"
  | "request_change"
  | "postpone"
  | "keep_both";

export interface ConflictResolution {
  id: UUID;
  conflict_id: UUID;
  user_id: UUID;
  action: ResolutionAction;
  withdrawn_event_id: UUID | null;
  message: string | null;
  notify_organizer: boolean;
  proposed_start: ISODateTime | null;
  proposed_end: ISODateTime | null;
  created_at: ISODateTime;
}

export interface EventChange {
  id: UUID;
  event_id: UUID;
  organization_id: UUID;
  changed_by: UUID;
  change_type:
    | "created"
    | "updated"
    | "rescheduled"
    | "cancelled"
    | "participant_withdrawn"
    | "participant_responded"
    | "participants_invited";
  before: unknown;
  after: unknown;
  created_at: ISODateTime;
}

export interface Reminder {
  id: UUID;
  event_id: UUID;
  organization_id: UUID;
  user_id: UUID;
  offset_minutes: number;
  occurrence_start: ISODateTime;
  remind_at: ISODateTime;
  status: "scheduled" | "sent" | "cancelled" | "failed";
  dedupe_key: string;
  sent_at: ISODateTime | null;
  created_at: ISODateTime;
}

export type NotificationType =
  | "reminder"
  | "invitation"
  | "invitation_response"
  | "event_cancelled"
  | "event_rescheduled"
  | "participant_withdrawn"
  | "conflict_detected"
  | "change_requested"
  | "slot_proposed"
  | "system";

export interface NotificationRow {
  id: UUID;
  user_id: UUID;
  organization_id: UUID;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: ISODateTime | null;
  dedupe_key: string;
  created_at: ISODateTime;
}

export type DeliveryChannel = "in_app" | "email" | "push";
export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export interface NotificationDelivery {
  id: UUID;
  notification_id: UUID;
  user_id: UUID;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  attempts: number;
  last_error: string | null;
  next_attempt_at: ISODateTime | null;
  sent_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface AgentTask {
  id: UUID;
  organization_id: UUID;
  user_id: UUID | null;
  agent: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  input: unknown;
  output: unknown;
  error: string | null;
  attempts: number;
  run_after: ISODateTime;
  idempotency_key: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AuditLog {
  id: UUID;
  organization_id: UUID | null;
  actor_id: UUID | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: ISODateTime;
}

export interface IdempotencyKey {
  id: UUID;
  user_id: UUID;
  key: string;
  scope: string;
  response: unknown;
  created_at: ISODateTime;
}

export interface PushSubscriptionRow {
  id: UUID;
  user_id: UUID;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  disabled_at: ISODateTime | null;
  last_error: string | null;
  created_at: ISODateTime;
}

/** Utilisateurs du mode local uniquement (en mode Supabase : auth.users). */
export interface LocalUser {
  id: UUID;
  email: string;
  password_hash: string;
  created_at: ISODateTime;
}

export interface Tables {
  profiles: Profile;
  organizations: Organization;
  organization_members: OrganizationMember;
  groups: Group;
  group_members: GroupMember;
  uploads: Upload;
  extraction_jobs: ExtractionJob;
  extracted_events: ExtractedEventRow;
  events: EventRow;
  event_occurrences: EventOccurrence;
  event_participants: EventParticipant;
  invitations: Invitation;
  calendar_connections: CalendarConnection;
  calendar_sync_records: CalendarSyncRecord;
  calendar_conflicts: CalendarConflict;
  conflict_resolutions: ConflictResolution;
  event_changes: EventChange;
  reminders: Reminder;
  notifications: NotificationRow;
  notification_deliveries: NotificationDelivery;
  agent_tasks: AgentTask;
  audit_logs: AuditLog;
  idempotency_keys: IdempotencyKey;
  push_subscriptions: PushSubscriptionRow;
  local_users: LocalUser;
}

export type TableName = keyof Tables;
