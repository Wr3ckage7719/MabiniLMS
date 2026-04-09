import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Plus, X } from 'lucide-react';

export default function SystemSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [emailDomains, setEmailDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [requireTeacherApproval, setRequireTeacherApproval] = useState(true);
  const [allowStudentSelfSignup, setAllowStudentSelfSignup] = useState(false);
  const [emailProvider, setEmailProvider] = useState<'mock' | 'smtp' | 'gmail'>('mock');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: adminService.getSystemSettings,
    onSuccess: (data) => {
      if (data.institutional_email_domains) {
        setEmailDomains(data.institutional_email_domains.value || []);
      }
      if (data.require_teacher_approval) {
        setRequireTeacherApproval(data.require_teacher_approval.value);
      }
      if (data.allow_student_self_signup) {
        setAllowStudentSelfSignup(data.allow_student_self_signup.value);
      }
      if (data.email_provider?.value) {
        setEmailProvider(data.email_provider.value);
      }
      if (data.smtp_host?.value) {
        setSmtpHost(String(data.smtp_host.value));
      }
      if (data.smtp_port?.value !== undefined) {
        setSmtpPort(String(data.smtp_port.value));
      }
      if (data.smtp_secure?.value !== undefined) {
        setSmtpSecure(Boolean(data.smtp_secure.value));
      }
      if (data.smtp_user?.value) {
        setSmtpUser(String(data.smtp_user.value));
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: adminService.updateSystemSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Settings Updated',
        description: 'System settings have been saved successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update settings',
        variant: 'destructive',
      });
    },
  });

  const handleAddDomain = () => {
    if (newDomain && !emailDomains.includes(newDomain)) {
      setEmailDomains([...emailDomains, newDomain]);
      setNewDomain('');
    }
  };

  const handleRemoveDomain = (domain: string) => {
    setEmailDomains(emailDomains.filter(d => d !== domain));
  };

  const handleSave = () => {
    updateMutation.mutate({
      institutional_email_domains: emailDomains,
      require_teacher_approval: requireTeacherApproval,
      allow_student_self_signup: allowStudentSelfSignup,
      email_provider: emailProvider,
      smtp_host: smtpHost,
      smtp_port: Number(smtpPort) || 587,
      smtp_secure: smtpSecure,
      smtp_user: smtpUser,
      ...(smtpPass ? { smtp_pass: smtpPass } : {}),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">System Settings</h1>
          <p className="text-slate-400">Configure system-wide settings</p>
        </div>

        <Card className="bg-slate-800 border-slate-700 p-6 space-y-6">
          {/* Institutional Email Domains */}
          <div>
            <Label className="text-white mb-3 block">Institutional Email Domains</Label>
            <p className="text-sm text-slate-400 mb-4">
              Email domains allowed for student signup (e.g., school.edu, university.edu)
            </p>
            <div className="space-y-2">
              {emailDomains.map((domain, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={domain} readOnly className="bg-slate-900 border-slate-700 text-white" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveDomain(domain)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="example.edu"
                  className="bg-slate-900 border-slate-700 text-white"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddDomain()}
                />
                <Button onClick={handleAddDomain} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Teacher Approval */}
          <div className="flex items-center justify-between py-4 border-t border-slate-700">
            <div>
              <Label className="text-white">Require Teacher Approval</Label>
              <p className="text-sm text-slate-400 mt-1">
                Teachers must be approved by admin before accessing features
              </p>
            </div>
            <Switch
              checked={requireTeacherApproval}
              onCheckedChange={setRequireTeacherApproval}
            />
          </div>

          {/* Student Self Signup */}
          <div className="flex items-center justify-between py-4 border-t border-slate-700">
            <div>
              <Label className="text-white">Allow Student Self-Signup</Label>
              <p className="text-sm text-slate-400 mt-1">
                Students can register accounts themselves (not recommended)
              </p>
            </div>
            <Switch
              checked={allowStudentSelfSignup}
              onCheckedChange={setAllowStudentSelfSignup}
            />
          </div>

          {/* Email / SMTP Settings */}
          <div className="space-y-4 py-4 border-t border-slate-700">
            <div>
              <Label className="text-white mb-2 block">Email Provider</Label>
              <p className="text-sm text-slate-400 mb-3">
                Use smtp or gmail in production. Keep mock for local development only.
              </p>
              <Select value={emailProvider} onValueChange={(value) => setEmailProvider(value as 'mock' | 'smtp' | 'gmail')}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mock">mock</SelectItem>
                  <SelectItem value="smtp">smtp</SelectItem>
                  <SelectItem value="gmail">gmail</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white">SMTP Host</Label>
                <Input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white">SMTP Port</Label>
                <Input
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white">SMTP User</Label>
                <Input
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="your_email@example.com"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white">SMTP Password</Label>
                <Input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-2 border-t border-slate-700">
              <div>
                <Label className="text-white">SMTP Secure (TLS)</Label>
                <p className="text-sm text-slate-400 mt-1">Enable when your SMTP provider requires secure transport</p>
              </div>
              <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
