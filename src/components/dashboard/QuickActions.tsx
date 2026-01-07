import { Mail, Calendar, CheckSquare, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function QuickActions() {
  const navigate = useNavigate();

  const goToConversations = (prompt?: string) => {
    // Navigate to conversations and optionally pre-fill prompt
    navigate('/conversations');
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Button 
        variant="outline" 
        className="gap-2"
        onClick={() => goToConversations()}
      >
        <Mail className="h-4 w-4" />
        Compose Email
      </Button>
      <Button 
        variant="outline" 
        className="gap-2"
        onClick={() => goToConversations()}
      >
        <Calendar className="h-4 w-4" />
        Schedule Meeting
      </Button>
      <Button 
        variant="outline" 
        className="gap-2"
        onClick={() => goToConversations()}
      >
        <CheckSquare className="h-4 w-4" />
        Add Task
      </Button>
      <Button 
        variant="outline" 
        className="gap-2"
        onClick={() => goToConversations()}
      >
        <MessageSquare className="h-4 w-4" />
        Ask mai
      </Button>
    </div>
  );
}