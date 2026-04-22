import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { usersService } from '@/services/users.service';
import { useToast } from '@/hooks/use-toast';
import {
  getRoleBasedDefaultZoomLock,
  readPwaMobileZoomPolicyPreference,
  writePwaMobileZoomPolicyPreference,
} from '@/lib/pwa-zoom-policy';
import { applyThemePreference, isDarkModeEnabled } from '@/lib/theme';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';

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

export default function TeacherSettingsPage() {
  const { user, updateAvatar } = useAuth();
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
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');

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
    setAvatarUrl(user?.avatarUrl || null);
  }, [user?.avatarUrl]);

  useEffect(() => {
    const [firstToken = '', ...restTokens] = (user?.name || '').trim().split(/\s+/).filter(Boolean);
    setFirstName(firstToken);
    setLastName(restTokens.join(' '));
  }, [user?.name]);

  const avatarFallback = useMemo(() => {
    if (!user?.name) return 'T';
    const initials = user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
    return initials || user.name[0]?.toUpperCase() || 'T';
  }, [user?.name]);

  const passwordRequirements = useMemo(() => ([
    { label: 'At least 8 characters', met: newPassword.length >= 8, required: true },
    { label: 'Passwords match', met: newPassword === confirmPassword && newPassword.length > 0, required: true },
    { label: 'Contains a number (recommended)', met: /\d/.test(newPassword), required: false },
    { label: 'Contains uppercase letter (recommended)', met: /[A-Z]/.test(newPassword), required: false },
  ]), [newPassword, confirmPassword]);

  const requiredPasswordChecks = passwordRequirements.filter((requirement) => requirement.required);

  const canSubmitPasswordChange =
    currentPassword.length > 0 && requiredPasswordChecks.every((requirement) => requirement.met);

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

  const handleChangePassword = async () => {
    if (!user) {
      return;
    }

    setPasswordChangeError('');

    if (!canSubmitPasswordChange) {
      setPasswordChangeError('Please satisfy all required password checks before updating your password.');
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
      setPasswordChangeError('');

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
              {avatarUrl && <AvatarImage src={avatarUrl} alt={`${user?.name || 'Teacher'} avatar`} />}
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
        <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Student submissions</p>
              <p className="text-xs text-muted-foreground">Notify when students submit assignments</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Grading reminders</p>
              <p className="text-xs text-muted-foreground">Remind me when assignments need grading</p>
            </div>
            <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Class announcements</p>
              <p className="text-xs text-muted-foreground">Notify on new class announcements</p>
            </div>
            <Switch checked={dueDateReminders} onCheckedChange={setDueDateReminders} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Security</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teacher-current-password">Current password</Label>
            <div className="relative">
              <Input
                id="teacher-current-password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                className="rounded-xl pr-11"
                disabled={isChangingPassword}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={() => setShowCurrentPassword((previous) => !previous)}
                aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                disabled={isChangingPassword}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="teacher-new-password">New password</Label>
            <div className="relative">
              <Input
                id="teacher-new-password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className="rounded-xl pr-11"
                disabled={isChangingPassword}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={() => setShowNewPassword((previous) => !previous)}
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                disabled={isChangingPassword}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="teacher-confirm-password">Confirm new password</Label>
            <div className="relative">
              <Input
                id="teacher-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="rounded-xl pr-11"
                disabled={isChangingPassword}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={() => setShowConfirmPassword((previous) => !previous)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                disabled={isChangingPassword}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
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
            {isChangingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Update password
          </Button>
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
