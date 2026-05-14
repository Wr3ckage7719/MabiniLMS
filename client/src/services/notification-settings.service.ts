import { apiClient } from './api-client';

export interface NotificationTypePreference {
  email?: boolean;
  push?: boolean;
  in_app?: boolean;
}

export interface NotificationSettings {
  email_enabled: boolean;
  push_enabled: boolean;
  due_date_reminders_enabled: boolean;
  due_date_reminder_lead_hours: number;
  type_preferences: Record<string, NotificationTypePreference>;
}

export type NotificationSettingsPatch = Partial<
  Pick<
    NotificationSettings,
    'email_enabled' | 'push_enabled' | 'due_date_reminders_enabled' | 'due_date_reminder_lead_hours' | 'type_preferences'
  >
>;

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

const unwrap = <T,>(payload: ApiEnvelope<T> | T): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    const envelope = payload as ApiEnvelope<T>;
    if (typeof envelope.success === 'boolean' && envelope.data !== undefined) {
      return envelope.data;
    }
  }
  return payload as T;
};

export const notificationSettingsService = {
  async get(): Promise<NotificationSettings> {
    const response = await apiClient.get<ApiEnvelope<NotificationSettings>>('/notification-settings');
    return unwrap<NotificationSettings>(response.data);
  },

  async update(patch: NotificationSettingsPatch): Promise<NotificationSettings> {
    const response = await apiClient.put<ApiEnvelope<NotificationSettings>>(
      '/notification-settings',
      patch,
    );
    return unwrap<NotificationSettings>(response.data);
  },
};
