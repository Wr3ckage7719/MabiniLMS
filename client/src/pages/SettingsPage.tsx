import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usersService } from '@/services/users.service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  getPushEnableErrorMessage,
  pushNotificationsService,
} from '@/services/push-notifications.service';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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

export default function SettingsPage() {
  const { user, updateAvatar } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl || null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(DEFAULT_LOCAL_SETTINGS.emailNotifications);
  const [pushNotifications, setPushNotifications] = useState(DEFAULT_LOCAL_SETTINGS.pushNotifications);
  const [dueDateReminders, setDueDateReminders] = useState(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [isCheckingPasswordRequirement, setIsCheckingPasswordRequirement] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');

  const settingsStorageKey = user?.id ? `mabini:settings:${user.id}` : null;

  useEffect(() => {
    if (!settingsStorageKey || typeof window === 'undefined') {
      setPreferencesReady(true);
      return;
    }

    try {
      const rawValue = localStorage.getItem(settingsStorageKey);
      if (!rawValue) {
        setDarkMode(DEFAULT_LOCAL_SETTINGS.darkMode);
        setEmailNotifications(DEFAULT_LOCAL_SETTINGS.emailNotifications);
        setPushNotifications(DEFAULT_LOCAL_SETTINGS.pushNotifications);
        setDueDateReminders(DEFAULT_LOCAL_SETTINGS.dueDateReminders);
      } else {
        const parsed = JSON.parse(rawValue) as Partial<LocalSettingsPreferences>;
        setDarkMode(Boolean(parsed.darkMode));
        setEmailNotifications(parsed.emailNotifications ?? DEFAULT_LOCAL_SETTINGS.emailNotifications);
        setPushNotifications(parsed.pushNotifications ?? DEFAULT_LOCAL_SETTINGS.pushNotifications);
        setDueDateReminders(parsed.dueDateReminders ?? DEFAULT_LOCAL_SETTINGS.dueDateReminders);
      }
    } catch {
      setDarkMode(DEFAULT_LOCAL_SETTINGS.darkMode);
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

    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode, preferencesReady]);

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
        const { data } = await supabase
          .from('temporary_passwords')
          .select('must_change_password, expires_at')
          .eq('user_id', user.id)
          .eq('must_change_password', true)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!isActive) {
          return;
        }

        setRequiresPasswordChange(Boolean(data?.must_change_password));
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

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload JPG, PNG, GIF, or WebP.',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Avatar must be 5MB or less.',
        variant: 'destructive',
      });
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
      toast({
        title: 'Avatar updated',
        description: 'Your profile avatar has been updated.',
      });
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

      toast({
        title: 'Upload failed',
        description: errorMessage,
        variant: 'destructive',
      });
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
      const responseMessage = axios.isAxiosError(error)
        ? error.response?.data?.error?.message || error.response?.data?.message
        : undefined;
      profileSaveError = responseMessage || (error instanceof Error ? error.message : 'Unable to update profile.');
    }

    if (settingsStorageKey && typeof window !== 'undefined') {
      const preferences: LocalSettingsPreferences = {
        darkMode,
        emailNotifications,
        pushNotifications,
        dueDateReminders,
      };
      localStorage.setItem(settingsStorageKey, JSON.stringify(preferences));
      localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    }

    if (profileSaveError) {
      toast({
        title: 'Profile save failed',
        description: `${profileSaveError} Appearance and notification settings were saved locally.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Settings saved',
        description: 'Your profile and preferences have been saved.',
      });
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
        toast({
          title: 'Push permission not granted',
          description: 'Allow notifications in your browser settings to enable push notifications.',
        });
      }
    } catch (error) {
      setPushNotifications(false);
      toast({
        title: 'Unable to enable push notifications',
        description: getPushEnableErrorMessage(error),
        variant: 'destructive',
      });
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

      toast({
        title: 'Password updated',
        description: 'Your password has been changed successfully.',
      });
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

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Enable dark theme for the application</p>
            </div>
            <Switch checked={darkMode} onCheckedChange={setDarkMode} />
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
