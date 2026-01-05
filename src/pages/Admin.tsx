import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Shield, Globe, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AllowedDomain {
  id: string;
  domain: string;
  created_at: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: "admin" | "moderator" | "user";
  created_at: string;
  user_email?: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useAdminCheck();
  
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "moderator" | "user">("user");
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [addingDomain, setAddingDomain] = useState(false);
  const [addingRole, setAddingRole] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      navigate("/conversations");
    }
  }, [isAdmin, adminLoading, navigate, toast]);

  useEffect(() => {
    if (isAdmin) {
      fetchDomains();
      fetchUserRoles();
    }
  }, [isAdmin]);

  const fetchDomains = async () => {
    setLoadingDomains(true);
    const { data, error } = await supabase
      .from("allowed_domains")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching domains:", error);
      toast({
        title: "Error",
        description: "Failed to fetch allowed domains.",
        variant: "destructive",
      });
    } else {
      setDomains(data || []);
    }
    setLoadingDomains(false);
  };

  const fetchUserRoles = async () => {
    setLoadingRoles(true);
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user roles:", error);
      toast({
        title: "Error",
        description: "Failed to fetch user roles.",
        variant: "destructive",
      });
    } else {
      setUserRoles(data || []);
    }
    setLoadingRoles(false);
  };

  const addDomain = async () => {
    if (!newDomain.trim()) return;
    
    setAddingDomain(true);
    const domainToAdd = newDomain.trim().toLowerCase();
    
    const { error } = await supabase
      .from("allowed_domains")
      .insert({ domain: domainToAdd });

    if (error) {
      console.error("Error adding domain:", error);
      toast({
        title: "Error",
        description: error.message.includes("duplicate") 
          ? "This domain is already allowed." 
          : "Failed to add domain.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Domain "${domainToAdd}" has been added.`,
      });
      setNewDomain("");
      fetchDomains();
    }
    setAddingDomain(false);
  };

  const removeDomain = async (id: string, domain: string) => {
    const { error } = await supabase
      .from("allowed_domains")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error removing domain:", error);
      toast({
        title: "Error",
        description: "Failed to remove domain.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Domain "${domain}" has been removed.`,
      });
      fetchDomains();
    }
  };

  const addUserRole = async () => {
    if (!newUserEmail.trim()) return;
    
    setAddingRole(true);
    
    // First, we need to find the user by email using auth admin API
    // Since we can't access auth.users directly, we'll use an edge function
    const { data: userData, error: userError } = await supabase.functions.invoke("get-user-by-email", {
      body: { email: newUserEmail.trim().toLowerCase() },
    });

    if (userError || !userData?.user_id) {
      toast({
        title: "Error",
        description: "User not found. Make sure they have signed up first.",
        variant: "destructive",
      });
      setAddingRole(false);
      return;
    }

    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userData.user_id, role: newUserRole });

    if (error) {
      console.error("Error adding role:", error);
      toast({
        title: "Error",
        description: error.message.includes("duplicate") 
          ? "This user already has this role." 
          : "Failed to add role.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: `Role "${newUserRole}" assigned to ${newUserEmail}.`,
      });
      setNewUserEmail("");
      fetchUserRoles();
    }
    setAddingRole(false);
  };

  const removeRole = async (id: string) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error removing role:", error);
      toast({
        title: "Error",
        description: "Failed to remove role.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Role has been removed.",
      });
      fetchUserRoles();
    }
  };

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-8">

      {/* Allowed Domains Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Allowed Email Domains</CardTitle>
          </div>
          <CardDescription>
            Only users with email addresses from these domains can sign up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDomain()}
            />
            <Button onClick={addDomain} disabled={addingDomain || !newDomain.trim()}>
              {addingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1">Add</span>
            </Button>
          </div>

          {loadingDomains ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : domains.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No domains configured. Add a domain to restrict signups.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="font-medium">{domain.domain}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(domain.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDomain(domain.id, domain.domain)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* User Roles Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle>User Roles</CardTitle>
          </div>
          <CardDescription>
            Assign roles to users. Admins can manage domains and roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="user@example.com"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as typeof newUserRole)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addUserRole} disabled={addingRole || !newUserEmail.trim()}>
              {addingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1">Add</span>
            </Button>
          </div>

          {loadingRoles ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : userRoles.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No user roles assigned yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRoles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-mono text-xs">
                      {role.user_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.role === "admin" ? "default" : role.role === "moderator" ? "secondary" : "outline"}>
                        {role.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(role.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRole(role.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Admin;
