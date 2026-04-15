import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usersService } from '@/services/users.service';
import { passwordStatusService } from '@/services/password-status.service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getFeedbackErrorMessage, notifyError, notifySuccess, notifyWarning } from '@/lib/feedback';
import {
  getPushEnableErrorMessage,
  pushNotificationsService,
} from '@/services/push-notifications.service';
import {
  getRoleBasedDefaultZoomLock,
  readPwaMobileZoomPolicyPreference,
  writePwaMobileZoomPolicyPreference,
} from '@/lib/pwa-zoom-policy';
import { applyThemePreference, isDarkModeEnabled } from '@/lib/theme';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Clock3, Link2, Loader2, Trash2, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LocalSettingsPreferences {
  darkMode: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  dueDateReminders: boolean;
}

const DEFAULT_LOCAL_SETTINGS: LocalSettingsPreferences = {
  darkMode: false,
  emailNotifications: true,
  pushNotifications: true,
  dueDateReminders: true,
};

const getInitials = (value: string): string => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'U';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
};

const formatLastUsedAt = (value: string): string => {
  const parsedTime = Date.parse(value);
  if (Number.isNaN(parsedTime)) {
    return 'Unknown';
  }

  const diffMinutes = Math.floor((Date.now() - parsedTime) / 60000);

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedTime);
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    user,
    isLoading: isAuthLoading,
    updateAvatar,
    linkedStudentAccounts,
    switchStudentAccount,
    renameLinkedStudentAccount,
    removeLinkedStudentAccount,
    loginWithGoogle,
  } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [darkMode, setDarkMode] = useState(() => isDarkModeEnabled());
  const [emailNotifications, setEmailNotifications] = useState(DEFAULT_LOCAL_SETTINGS.emailNotifications);
  const [pushNotifications, setPushNotifications] = useState(DEFAULT_LOCAL_SETTINGS.pushNotifications);
  const [dueDateReminders, setDueDateReminders] = useState(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
  const [lockPwaMobileZoom, setLockPwaMobileZoom] = useState(false);
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [isCheckingPasswordRequirement, setIsCheckingPasswordRequirement] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [accountNameDrafts, setAccountNameDrafts] = useState<Record<string, string>>({});
  const [isAddingLinkedAccount, setIsAddingLinkedAccount] = useState(false);
  const [isSwitchingLinkedAccount, setIsSwitchingLinkedAccount] = useState<string | null>(null);
  const [isRenamingLinkedAccount, setIsRenamingLinkedAccount] = useState<string | null>(null);
  const [isRemovingLinkedAccount, setIsRemovingLinkedAccount] = useState<string | null>(null);

  const settingsStorageKey = user?.id ? `mabini:settings:${user.id}` : null;
  const roleBasedDefaultZoomLock = useMemo(() => getRoleBasedDefaultZoomLock(user?.role || null), [user?.role]);

  useEffect(() => {
    const preference = readPwaMobileZoomPolicyPreference();

    if (preference === 'enabled') {
      setLockPwaMobileZoom(true);
      return;
    }

    if (preference === 'disabled') {
      setLockPwaMobileZoom(false);
      return;
    }

    setLockPwaMobileZoom(roleBasedDefaultZoomLock);
  }, [roleBasedDefaultZoomLock]);

  useEffect(() => {
    setDarkMode(isDarkModeEnabled());

    if (!settingsStorageKey || typeof window === 'undefined') {
      setPreferencesReady(true);
      return;
    }

    try {
      const rawValue = localStorage.getItem(settingsStorageKey);
      if (!rawValue) {
        setEmailNotifications(DEFAULT_LOCAL_SETTINGS.emailNotifications);
        setPushNotifications(DEFAULT_LOCAL_SETTINGS.pushNotifications);
        setDueDateReminders(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
      } else {
        const parsed = JSON.parse(rawValue) as Partial<LocalSettingsPreferences>;
        setEmailNotifications(parsed.emailNotifications ?? DEFAULT_LOCAL_SETTINGS.emailNotifications);
        setPushNotifications(parsed.pushNotifications ?? DEFAULT_LOCAL_SETTINGS.pushNotifications);
        setDueDateReminders(parsed.dueDateReminders ?? DEFAULT_LOCAL_SETTINGS.dueDateReminders);
      }
    } catch {
      setEmailNotifications(DEFAULT_LOCAL_SETTINGS.emailNotifications);
      setPushNotifications(DEFAULT_LOCAL_SETTINGS.pushNotifications);
      setDueDateReminders(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
    } finally {
      setPreferencesReady(true);
    }
  }, [settingsStorageKey]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (!pushNotificationsService.isSupported()) {
      setPushNotifications(false);
      return;
    }

    if (pushNotificationsService.getPermission() !== 'granted') {
      setPushNotifications(false);
    }
  }, [preferencesReady]);

  useEffect(() => {
    let isActive = true;

    const checkPasswordRequirement = async () => {
      if (!user?.id) {
        if (!isActive) {
          return;
        }

        setRequiresPasswordChange(false);
        setIsCheckingPasswordRequirement(false);
        return;
      }

      setIsCheckingPasswordRequirement(true);

      try {
        const requiresPasswordChange = await passwordStatusService.requiresPasswordChange(user.id);

        if (!isActive) {
          return;
        }

        setRequiresPasswordChange(requiresPasswordChange);
      } catch {
        if (!isActive) {
          return;
        }

        setRequiresPasswordChange(false);
      } finally {
        if (isActive) {
          setIsCheckingPasswordRequirement(false);
        }
      }
    };

    void checkPasswordRequirement();

    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl || null);
  }, [user?.avatarUrl]);

  useEffect(() => {
    const [firstToken = '', ...restTokens] = (user?.name || '').trim().split(/\s+/).filter(Boolean);
    setFirstName(firstToken);
    setLastName(restTokens.join(' '));
  }, [user?.name]);

  useEffect(() => {
    setAccountNameDrafts((previousDrafts) => {
      const nextDrafts: Record<string, string> = {};

      linkedStudentAccounts.forEach((account) => {
        nextDrafts[account.userId] = previousDrafts[account.userId] ?? account.customName ?? '';
      });

      return nextDrafts;
    });
  }, [linkedStudentAccounts]);

  const avatarFallback = useMemo(() => {
    if (!user?.name) return 'U';
    const initials = user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
    return initials || user.name[0]?.toUpperCase() || 'U';
  }, [user?.name]);

  const passwordRequirements = useMemo(() => ([
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(newPassword) },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(newPassword) },
    { label: 'Passwords match', met: newPassword === confirmPassword && newPassword.length > 0 },
  ]), [newPassword, confirmPassword]);

  const canSubmitPasswordChange =
    currentPassword.length > 0 && passwordRequirements.every((requirement) => requirement.met);

  const handleOpenAvatarPicker = () => {
    fileInputRef.current?.click();
  };

  const handleDarkModeChange = (enabled: boolean) => {
    setDarkMode(enabled);
    applyThemePreference(enabled ? 'dark' : 'light');
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      notifyWarning(toast, 'Please upload JPG, PNG, GIF, or WebP.', 'Invalid file type');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notifyWarning(toast, 'Avatar must be 5MB or less.', 'File too large');
      event.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const response = await usersService.uploadAvatar(file) as { data?: { avatar_url?: string } };
      const uploadedAvatarUrl = response?.data?.avatar_url;
      if (uploadedAvatarUrl) {
        setAvatarUrl(uploadedAvatarUrl);
        updateAvatar(uploadedAvatarUrl);
      }
      notifySuccess(toast, 'Your profile avatar has been updated.', 'Avatar updated');
    } catch (error) {
      const isNetworkError = axios.isAxiosError(error) && !error.response;
      const responseMessage = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.response?.data?.message
        : undefined;
      const errorMessage = isNetworkError
        ? 'Cannot reach upload API. Check production VITE_API_URL, CORS, and backend availability.'
        : responseMessage ||
          (error instanceof Error
          ? error.message
          : 'Unable to update avatar.');

      notifyError(toast, errorMessage, 'Upload failed');
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    setIsSavingProfile(true);
    let profileSaveError: string | null = null;

    try {
      await usersService.updateProfile({
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      });
    } catch (error) {
      profileSaveError = getFeedbackErrorMessage(error, 'Unable to update profile.');
    }

    if (settingsStorageKey && typeof window !== 'undefined') {
      const preferences: LocalSettingsPreferences = {
        darkMode,
        emailNotifications,
        pushNotifications,
        dueDateReminders,
      };
      localStorage.setItem(settingsStorageKey, JSON.stringify(preferences));
      applyThemePreference(darkMode ? 'dark' : 'light');
    }

    writePwaMobileZoomPolicyPreference(
      lockPwaMobileZoom === roleBasedDefaultZoomLock
        ? 'auto'
        : lockPwaMobileZoom
          ? 'enabled'
          : 'disabled'
    );

    if (profileSaveError) {
      notifyError(
        toast,
        `${profileSaveError} Appearance and notification settings were saved locally.`,
        'Profile save failed'
      );
    } else {
      notifySuccess(toast, 'Your profile and preferences have been saved.', 'Settings saved');
    }

    setIsSavingProfile(false);
  };

  const handlePushNotificationsChange = async (enabled: boolean) => {
    setIsUpdatingPush(true);

    try {
      if (!enabled) {
        await pushNotificationsService.disablePushNotifications();
        setPushNotifications(false);
        return;
      }

      const didEnable = await pushNotificationsService.enablePushNotifications();
      setPushNotifications(didEnable);

      if (!didEnable) {
        notifyWarning(
          toast,
          'Allow notifications in your browser settings to enable push notifications.',
          'Push permission not granted'
        );
      }
    } catch (error) {
      setPushNotifications(false);
      notifyError(toast, getPushEnableErrorMessage(error), 'Unable to enable push notifications');
    } finally {
      setIsUpdatingPush(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) {
      return;
    }

    setPasswordChangeError('');

    if (!canSubmitPasswordChange) {
      setPasswordChangeError('Please satisfy all password requirements before updating your password.');
      return;
    }

    setIsChangingPassword(true);

    try {
      await usersService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRequiresPasswordChange(false);

      notifySuccess(toast, 'Your password has been changed successfully.', 'Password updated');
    } catch (error) {
      const responseMessage = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.response?.data?.message
        : undefined;
      setPasswordChangeError(
        responseMessage || (error instanceof Error ? error.message : 'Unable to change password.')
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleAddLinkedAccount = async () => {
    setIsAddingLinkedAccount(true);
    try {
      await loginWithGoogle('student');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open institutional account picker.';
      notifyError(toast, message, 'Add account failed');
    } finally {
      setIsAddingLinkedAccount(false);
    }
  };

  const handleSwitchLinkedAccount = async (targetUserId: string) => {
    if (targetUserId === user?.id) {
      return;
    }

    const targetAccount = linkedStudentAccounts.find((account) => account.userId === targetUserId);

    setIsSwitchingLinkedAccount(targetUserId);
    try {
      await switchStudentAccount(targetUserId);
      notifySuccess(
        toast,
        targetAccount ? `Now using ${targetAccount.email}.` : 'Student account switched.',
        'Account switched'
      );
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to switch linked account.';
      notifyError(toast, message, 'Switch failed');
    } finally {
      setIsSwitchingLinkedAccount(null);
    }
  };

  const handleRenameLinkedAccount = (accountId: string) => {
    const requestedName = (accountNameDrafts[accountId] || '').trim();

    setIsRenamingLinkedAccount(accountId);
    try {
      renameLinkedStudentAccount(accountId, requestedName);
      setAccountNameDrafts((previousDrafts) => ({
        ...previousDrafts,
        [accountId]: requestedName,
      }));
      notifySuccess(
        toast,
        requestedName ? 'Linked account label saved.' : 'Linked account label cleared.',
        'Account name updated'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to rename linked account.';
      notifyError(toast, message, 'Rename failed');
    } finally {
      setIsRenamingLinkedAccount(null);
    }
  };

  const handleRemoveLinkedAccount = (accountId: string, accountEmail: string) => {
    if (accountId === user?.id) {
      notifyWarning(toast, 'Switch to another linked account first before removing this one.', 'Cannot remove active account');
      return;
    }

    if (typeof window !== 'undefined') {
      const shouldRemove = window.confirm(`Remove linked account ${accountEmail}?`);
      if (!shouldRemove) {
        return;
      }
    }

    setIsRemovingLinkedAccount(accountId);
    try {
      removeLinkedStudentAccount(accountId);
      notifySuccess(toast, `${accountEmail} was removed from this device.`, 'Linked account removed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove linked account.';
      notifyError(toast, message, 'Remove failed');
    } finally {
      setIsRemovingLinkedAccount(null);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={`${user?.name || 'User'} avatar`} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">{avatarFallback}</AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={isUploadingAvatar}
              />
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={handleOpenAvatarPicker}
                disabled={isUploadingAvatar}
                type="button"
              >
                {isUploadingAvatar ? 'Uploading...' : 'Change avatar'}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ''} className="rounded-xl" disabled />
          </div>
        </CardContent>
      </Card>

      <div id="linked-accounts">
        <Card className="border-0 shadow-sm">
          <CardHeader className="space-y-4 sm:space-y-3">
            <div>
              <CardTitle className="text-base">Linked Accounts</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage institutional student accounts on this device: add, switch, rename, or remove.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl sm:w-auto"
              onClick={() => {
                void handleAddLinkedAccount();
              }}
              disabled={isAddingLinkedAccount || isAuthLoading}
            >
              {isAddingLinkedAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Add institutional account
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isAuthLoading ? (
              <div className="space-y-3">
                {[0, 1].map((index) => (
                  <div key={`linked-account-skeleton-${index}`} className="space-y-3 rounded-xl border border-border/70 p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-48" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-8 w-16 rounded-lg" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-10 w-24 rounded-xl" />
                      <Skeleton className="h-10 w-24 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : linkedStudentAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Link2 className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium">No linked institutional accounts yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your other student accounts to switch instantly without signing out.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 rounded-xl"
                  onClick={() => {
                    void handleAddLinkedAccount();
                  }}
                  disabled={isAddingLinkedAccount}
                >
                  {isAddingLinkedAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Add first account
                </Button>
              </div>
            ) : (
              linkedStudentAccounts.map((account) => (
                <div key={account.userId} className="space-y-3 rounded-xl border border-border/70 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt={`${account.displayName} avatar`} /> : null}
                        <AvatarFallback>{getInitials(account.displayName || account.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{account.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          <span>Last used {formatLastUsedAt(account.lastUsedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {account.userId === user?.id ? (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Active
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            void handleSwitchLinkedAccount(account.userId);
                          }}
                          disabled={isSwitchingLinkedAccount !== null}
                        >
                          {isSwitchingLinkedAccount === account.userId ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Link2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          Switch
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      value={accountNameDrafts[account.userId] ?? account.customName ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setAccountNameDrafts((previousDrafts) => ({
                          ...previousDrafts,
                          [account.userId]: value,
                        }));
                      }}
                      placeholder="Custom name (optional)"
                      className="rounded-xl"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => {
                        handleRenameLinkedAccount(account.userId);
                      }}
                      disabled={isRenamingLinkedAccount === account.userId}
                    >
                      {isRenamingLinkedAccount === account.userId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save name
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-xl text-destructive hover:text-destructive"
                      onClick={() => {
                        handleRemoveLinkedAccount(account.userId, account.email);
                      }}
                      disabled={isRemovingLinkedAccount === account.userId || account.userId === user?.id}
                    >
                      {isRemovingLinkedAccount === account.userId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Enable dark theme for the application</p>
            </div>
            <Switch checked={darkMode} onCheckedChange={handleDarkModeChange} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Lock zoom in installed mobile app</p>
              <p className="text-xs text-muted-foreground">
                Applies only in PWA mode. Role default is {roleBasedDefaultZoomLock ? 'On' : 'Off'}.
              </p>
            </div>
            <Switch checked={lockPwaMobileZoom} onCheckedChange={setLockPwaMobileZoom} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Security</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {requiresPasswordChange && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Temporary password detected</AlertTitle>
              <AlertDescription>
                Your account is still using a temporary password. Update it now to keep your account secure.
              </AlertDescription>
            </Alert>
          )}

          {isCheckingPasswordRequirement && (
            <p className="text-sm text-muted-foreground">Checking password status...</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="rounded-xl"
              disabled={isChangingPassword}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className="rounded-xl"
              disabled={isChangingPassword}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="rounded-xl"
              disabled={isChangingPassword}
            />
          </div>

          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Password Requirements:</p>
            {passwordRequirements.map((requirement) => (
              <div key={requirement.label} className="flex items-center gap-2 text-sm">
                {requirement.met ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                )}
                <span className={requirement.met ? 'text-green-700' : 'text-muted-foreground'}>
                  {requirement.label}
                </span>
              </div>
            ))}
          </div>

          {passwordChangeError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{passwordChangeError}</AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            className="rounded-xl"
            onClick={() => {
              void handleChangePassword();
            }}
            disabled={isChangingPassword || !canSubmitPasswordChange}
          >
            {isChangingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Update password
          </Button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Email notifications</p>
              <p className="text-xs text-muted-foreground">Get notified about new assignments</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Push notifications</p>
              <p className="text-xs text-muted-foreground">Browser push notifications</p>
            </div>
            <Switch
              checked={pushNotifications}
              onCheckedChange={(enabled) => {
                void handlePushNotificationsChange(enabled);
              }}
              disabled={isUpdatingPush}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Due date reminders</p>
              <p className="text-xs text-muted-foreground">Remind me 24h before deadlines</p>
            </div>
            <Switch checked={dueDateReminders} onCheckedChange={setDueDateReminders} />
          </div>
        </CardContent>
      </Card>

      <Button
        className="rounded-xl"
        onClick={() => {
          void handleSaveProfile();
        }}
        disabled={isSavingProfile}
      >
        {isSavingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Save changes
      </Button>
    </div>
  );
}
