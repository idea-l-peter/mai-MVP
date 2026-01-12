import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LayoutGrid, Plus, List } from 'lucide-react';
import mondayLogo from '@/assets/monday-logo.svg';

interface MondayBoard {
  id: string;
  name: string;
  board_kind: 'main' | 'shareable' | 'private';
}

interface MondayItem {
  id: string;
  name: string;
}

export function TestMondayContent() {
  const { toast } = useToast();
  
  // Boards state
  const [boards, setBoards] = useState<MondayBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardSearch, setBoardSearch] = useState('');
  const [itemsBoardSearch, setItemsBoardSearch] = useState('');
  const [createBoardSearch, setCreateBoardSearch] = useState('');
  
  // Items state
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [items, setItems] = useState<MondayItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // Create item state
  const [createBoardId, setCreateBoardId] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);

  // Helper to add timeout to any promise
  const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(errorMessage)), ms)
      )
    ]);
  };

  const getValidToken = async (): Promise<string | null> => {
    console.log('>>> getValidToken ENTERED for provider: monday');
    
    try {
      console.log('>>> getValidToken: About to call supabase.auth.getSession()...');
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        5000,
        'getSession() timed out after 5 seconds'
      );
      
      const session = sessionResult.data.session;
      const user = session?.user;
      console.log('>>> getValidToken: getSession() returned, user:', user?.id || 'NO USER');
      
      if (!user) {
        console.log('>>> getValidToken: No user, showing toast and returning null');
        toast({ title: 'Not authenticated', description: 'Please log in first', variant: 'destructive' });
        return null;
      }

      console.log('>>> getValidToken: About to invoke edge function get-valid-token...');
      const startTime = Date.now();
      
      // No need to send user_id - the edge function extracts it from JWT
      const { data, error } = await withTimeout(
        supabase.functions.invoke('get-valid-token', {
          body: { provider: 'monday' }
        }),
        10000,
        'Edge function timed out after 10 seconds'
      );
      
      console.log('>>> getValidToken: Edge function returned in', Date.now() - startTime, 'ms');
      console.log('>>> getValidToken: Response data:', JSON.stringify(data));
      console.log('>>> getValidToken: Response error:', error);

      if (error) {
        console.log('>>> getValidToken: Error from edge function, throwing');
        throw error;
      }
      
      if (!data?.connected) {
        console.log('>>> getValidToken: Not connected, data:', data);
        toast({ 
          title: 'monday.com not connected', 
          description: data?.error || 'Please connect from the Integrations page',
          variant: 'destructive' 
        });
        return null;
      }

      console.log('>>> getValidToken: SUCCESS, token length:', data.access_token?.length);
      return data.access_token;
    } catch (error) {
      console.error('>>> getValidToken CATCH ERROR:', error);
      toast({ 
        title: 'Failed to get token', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
      return null;
    }
  };

  const callMondayAPI = async (query: string, variables?: Record<string, unknown>) => {
    const token = await getValidToken();
    if (!token) return null;

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Monday API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(data.errors.map((e: { message: string }) => e.message).join(', '));
    }

    return data.data;
  };

  // ========== List Boards ==========
  const listBoards = async () => {
    console.log('=== listBoards START ===');
    setLoadingBoards(true);
    setBoards([]);
    
    try {
      const query = `query { boards(limit: 100) { id name board_kind } }`;
      const data = await callMondayAPI(query);
      
      if (data?.boards) {
        setBoards(data.boards);
        toast({ title: `Found ${data.boards.length} boards` });
      }
    } catch (error) {
      console.error('=== listBoards ERROR ===', error);
      toast({ 
        title: 'Failed to list boards', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      console.log('=== listBoards END ===');
      setLoadingBoards(false);
    }
  };

  // ========== List Items ==========
  const listItems = async () => {
    if (!selectedBoardId) {
      toast({ title: 'Please select a board first', variant: 'destructive' });
      return;
    }

    console.log('=== listItems START for board:', selectedBoardId);
    setLoadingItems(true);
    setItems([]);
    
    try {
      const query = `query ($boardId: [ID!]!) { 
        boards(ids: $boardId) { 
          items_page(limit: 50) { 
            items { id name } 
          } 
        } 
      }`;
      const data = await callMondayAPI(query, { boardId: [selectedBoardId] });
      
      const boardItems = data?.boards?.[0]?.items_page?.items || [];
      setItems(boardItems);
      toast({ title: `Found ${boardItems.length} items` });
    } catch (error) {
      console.error('=== listItems ERROR ===', error);
      toast({ 
        title: 'Failed to list items', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      console.log('=== listItems END ===');
      setLoadingItems(false);
    }
  };

  // ========== Create Item ==========
  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!createBoardId) {
      toast({ title: 'Please select a board', variant: 'destructive' });
      return;
    }
    
    if (!newItemName.trim()) {
      toast({ title: 'Please enter an item name', variant: 'destructive' });
      return;
    }

    console.log('=== createItem START ===');
    setCreatingItem(true);
    
    try {
      const query = `mutation ($boardId: ID!, $itemName: String!) { 
        create_item(board_id: $boardId, item_name: $itemName) { 
          id 
          name 
        } 
      }`;
      const data = await callMondayAPI(query, { 
        boardId: createBoardId, 
        itemName: newItemName.trim() 
      });
      
      if (data?.create_item) {
        toast({ 
          title: 'Item created!', 
          description: `Created: ${data.create_item.name}` 
        });
        setNewItemName('');
        
        // Refresh items if we're viewing the same board
        if (selectedBoardId === createBoardId) {
          listItems();
        }
      }
    } catch (error) {
      console.error('=== createItem ERROR ===', error);
      toast({ 
        title: 'Failed to create item', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      console.log('=== createItem END ===');
      setCreatingItem(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">Test monday.com GraphQL API functionality</p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* List Boards Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <img src={mondayLogo} alt="monday.com" className="h-5 w-5" />
              List Boards
            </CardTitle>
            <CardDescription>Fetch all boards you have access to</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={listBoards} 
              disabled={loadingBoards}
              className="w-full"
            >
              {loadingBoards && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <LayoutGrid className="mr-2 h-4 w-4" />
              List Boards
            </Button>

            {boards.length > 0 && (
              <>
                <Input
                  placeholder="Search boards..."
                  value={boardSearch}
                  onChange={(e) => setBoardSearch(e.target.value)}
                />
                <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                  {boards
                    .filter((board) => 
                      board.name.toLowerCase().includes(boardSearch.toLowerCase())
                    )
                    .map((board) => (
                      <div key={board.id} className="p-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{board.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            board.board_kind === 'private' 
                              ? 'bg-orange-100 text-orange-700' 
                              : board.board_kind === 'shareable'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {board.board_kind}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">ID: {board.id}</p>
                      </div>
                    ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* List Items Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              List Items
            </CardTitle>
            <CardDescription>Select a board and list its items</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Board</Label>
              <Input
                placeholder="Search boards..."
                value={itemsBoardSearch}
                onChange={(e) => setItemsBoardSearch(e.target.value)}
                className="mb-2"
              />
              <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
                <SelectTrigger>
                  <SelectValue placeholder={boards.length === 0 ? "Load boards first" : "Select a board"} />
                </SelectTrigger>
                <SelectContent>
                  {boards
                    .filter((board) => 
                      board.name.toLowerCase().includes(itemsBoardSearch.toLowerCase())
                    )
                    .map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={listItems} 
              disabled={loadingItems || !selectedBoardId}
              className="w-full"
            >
              {loadingItems && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              List Items
            </Button>

            {items.length > 0 && (
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="p-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">ID: {item.id}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Item Section */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Item
            </CardTitle>
            <CardDescription>Create a new item on a board</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createItem} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Select Board</Label>
                  <Input
                    placeholder="Search boards..."
                    value={createBoardSearch}
                    onChange={(e) => setCreateBoardSearch(e.target.value)}
                    className="mb-2"
                  />
                  <Select value={createBoardId} onValueChange={setCreateBoardId}>
                    <SelectTrigger>
                      <SelectValue placeholder={boards.length === 0 ? "Load boards first" : "Select a board"} />
                    </SelectTrigger>
                    <SelectContent>
                      {boards
                        .filter((board) => 
                          board.name.toLowerCase().includes(createBoardSearch.toLowerCase())
                        )
                        .map((board) => (
                          <SelectItem key={board.id} value={board.id}>
                            {board.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="itemName">Item Name</Label>
                  <Input
                    id="itemName"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Enter item name"
                  />
                </div>
              </div>

              <Button type="submit" disabled={creatingItem || !createBoardId || !newItemName.trim()}>
                {creatingItem && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Item
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
