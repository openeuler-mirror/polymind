import { useChatStore } from '../store';
import type { ChatState } from '../store';
import type { Message } from '../types';

describe('useChatStore', () => {
  // 保存初始状态，用于测试后恢复
  let initialState: Partial<ChatState>;
  
  beforeEach(() => {
    // 保存初始状态
    initialState = {
      conversations: [...useChatStore.getState().conversations],
      currentConversationId: useChatStore.getState().currentConversationId,
      isSidebarOpen: useChatStore.getState().isSidebarOpen,
      isRightPanelOpen: useChatStore.getState().isRightPanelOpen,
      isStreaming: useChatStore.getState().isStreaming,
      mcpTools: [...useChatStore.getState().mcpTools],
      settings: { ...useChatStore.getState().settings },
      rightPanelTabs: [...useChatStore.getState().rightPanelTabs],
      activeRightPanelTab: useChatStore.getState().activeRightPanelTab,
      agents: [...useChatStore.getState().agents],
      currentAgentId: useChatStore.getState().currentAgentId,
      agentStatus: { ...useChatStore.getState().agentStatus },
      activeSessions: { ...useChatStore.getState().activeSessions },
      wsConnections: { ...useChatStore.getState().wsConnections },
      isConnecting: useChatStore.getState().isConnecting,
      connectionError: useChatStore.getState().connectionError,
    };
    
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    // 恢复初始状态
    useChatStore.setState(initialState);
  });

  describe('Conversation management', () => {
    it('should create a new conversation', async () => {
      const store = useChatStore.getState();
      const initialCount = store.conversations.length;
      
      const newId = await store.createConversation();
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.conversations.length).toBe(initialCount + 1);
      expect(updatedStore.currentConversationId).toBe(newId);
      expect(updatedStore.conversations[0].id).toBe(newId);
      expect(updatedStore.conversations[0].title).toBe('新对话');
    });

    it('should delete a conversation', () => {
      const store = useChatStore.getState();
      const initialCount = store.conversations.length;
      const firstConversationId = store.conversations[0].id;
      
      store.deleteConversation(firstConversationId);
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.conversations.length).toBe(initialCount - 1);
      expect(updatedStore.conversations.some(c => c.id === firstConversationId)).toBe(false);
    });

    it('should set current conversation', () => {
      const store = useChatStore.getState();
      const secondConversationId = store.conversations[1].id;
      
      store.setCurrentConversation(secondConversationId);
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.currentConversationId).toBe(secondConversationId);
    });

    it('should add a message to a conversation', () => {
      const store = useChatStore.getState();
      const conversationId = store.conversations[0].id;
      const initialMessageCount = store.conversations[0].messages.length;
      
      const newMessage: Message = {
        id: 'test-message',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      };
      
      store.addMessage(conversationId, newMessage);
      const updatedStore = useChatStore.getState();
      const updatedConversation = updatedStore.conversations.find(c => c.id === conversationId);
      
      expect(updatedConversation?.messages.length).toBe(initialMessageCount + 1);
      expect(updatedConversation?.messages[updatedConversation.messages.length - 1]).toEqual(newMessage);
    });

    it('should update a message in a conversation', () => {
      const store = useChatStore.getState();
      const conversationId = store.conversations[0].id;
      const messageId = store.conversations[0].messages[0].id;
      
      const updates = {
        content: 'Updated content',
      };
      
      store.updateMessage(conversationId, messageId, updates);
      const updatedStore = useChatStore.getState();
      const updatedMessage = updatedStore.conversations
        .find(c => c.id === conversationId)?.messages
        .find(m => m.id === messageId);
      
      expect(updatedMessage?.content).toBe('Updated content');
    });

    it('should update conversation title', () => {
      const store = useChatStore.getState();
      const conversationId = store.conversations[0].id;
      const newTitle = 'Updated Title';
      
      store.updateConversationTitle(conversationId, newTitle);
      const updatedStore = useChatStore.getState();
      const updatedConversation = updatedStore.conversations.find(c => c.id === conversationId);
      
      expect(updatedConversation?.title).toBe(newTitle);
    });

    it('should toggle pin conversation', () => {
      const store = useChatStore.getState();
      const conversationId = store.conversations[0].id;
      const initialPinned = store.conversations[0].pinned;
      
      store.togglePinConversation(conversationId);
      const updatedStore = useChatStore.getState();
      const updatedConversation = updatedStore.conversations.find(c => c.id === conversationId);
      
      expect(updatedConversation?.pinned).toBe(!initialPinned);
    });
  });

  describe('UI state management', () => {
    it('should toggle sidebar', () => {
      const store = useChatStore.getState();
      const initialState = store.isSidebarOpen;
      
      store.toggleSidebar();
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.isSidebarOpen).toBe(!initialState);
    });

    it('should toggle right panel', () => {
      const store = useChatStore.getState();
      const initialState = store.isRightPanelOpen;
      
      store.toggleRightPanel();
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.isRightPanelOpen).toBe(!initialState);
    });

    it('should set streaming state', () => {
      const store = useChatStore.getState();
      
      store.setStreaming(true);
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.isStreaming).toBe(true);
    });

    it('should toggle tool', () => {
      const store = useChatStore.getState();
      const toolId = 'web-search';
      const initialEnabled = store.mcpTools.find(t => t.id === toolId)?.enabled;
      
      store.toggleTool(toolId);
      const updatedStore = useChatStore.getState();
      const updatedTool = updatedStore.mcpTools.find(t => t.id === toolId);
      
      expect(updatedTool?.enabled).toBe(!initialEnabled);
    });
  });

  describe('Settings management', () => {
    it('should update settings', () => {
      const store = useChatStore.getState();
      
      store.updateSettings({ theme: 'dark', language: 'en-US' });
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.settings.theme).toBe('dark');
      expect(updatedStore.settings.language).toBe('en-US');
    });
  });

  describe('Right panel tabs management', () => {
    it('should add a right panel tab', () => {
      const store = useChatStore.getState();
      const initialCount = store.rightPanelTabs.length;
      
      const newTab = {
        id: 'test-tab',
        name: 'Test Tab',
      };
      
      store.addRightPanelTab(newTab);
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.rightPanelTabs.length).toBe(initialCount + 1);
      expect(updatedStore.rightPanelTabs.some(t => t.id === 'test-tab')).toBe(true);
    });

    it('should not add duplicate right panel tab', () => {
      const store = useChatStore.getState();
      const initialCount = store.rightPanelTabs.length;
      
      const newTab = {
        id: 'test-tab',
        name: 'Test Tab',
      };
      
      store.addRightPanelTab(newTab);
      store.addRightPanelTab(newTab); // Add again
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.rightPanelTabs.length).toBe(initialCount + 1);
    });

    it('should remove a right panel tab', () => {
      const store = useChatStore.getState();
      
      // Add a test tab first
      const newTab = {
        id: 'test-tab',
        name: 'Test Tab',
      };
      store.addRightPanelTab(newTab);
      
      // Verify the tab was added
      const afterAddStore = useChatStore.getState();
      expect(afterAddStore.rightPanelTabs.some(t => t.id === 'test-tab')).toBe(true);
      
      // Remove the tab
      store.removeRightPanelTab('test-tab');
      const updatedStore = useChatStore.getState();
      
      // Verify the tab was removed
      expect(updatedStore.rightPanelTabs.some(t => t.id === 'test-tab')).toBe(false);
    });

    it('should set active right panel tab', () => {
      const store = useChatStore.getState();
      
      // Add a test tab first
      const newTab = {
        id: 'test-tab',
        name: 'Test Tab',
      };
      store.addRightPanelTab(newTab);
      
      store.setActiveRightPanelTab('test-tab');
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.activeRightPanelTab).toBe('test-tab');
    });
  });

  describe('Agent management', () => {
    it('should set current agent', () => {
      const store = useChatStore.getState();
      
      store.setCurrentAgent('test-agent-id');
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.currentAgentId).toBe('test-agent-id');
    });

    it('should add an agent', () => {
      const store = useChatStore.getState();
      const initialCount = store.agents.length;
      
      const newAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        adapterType: 'OPENCODE',
        status: 'READY',
        sandboxId: '',
        defaultSessionId: '',
        hasScheduledTasks: false,
        idleTimeout: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      store.addAgent(newAgent);
      const updatedStore = useChatStore.getState();
      
      expect(updatedStore.agents.length).toBe(initialCount + 1);
      expect(updatedStore.agents.some(a => a.id === 'test-agent')).toBe(true);
    });

    it('should update an agent', () => {
      const store = useChatStore.getState();
      
      // Add a test agent first
      const newAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        adapterType: 'OPENCODE',
        status: 'READY',
        sandboxId: '',
        defaultSessionId: '',
        hasScheduledTasks: false,
        idleTimeout: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.addAgent(newAgent);
      
      // Update the agent
      const updatedAgent = {
        ...newAgent,
        name: 'Updated Agent',
        status: 'BUSY',
      };
      store.updateAgent(updatedAgent);
      
      const updatedStore = useChatStore.getState();
      const agent = updatedStore.agents.find(a => a.id === 'test-agent');
      
      expect(agent?.name).toBe('Updated Agent');
      expect(agent?.status).toBe('BUSY');
    });

    it('should remove an agent', () => {
      const store = useChatStore.getState();
      
      // Add a test agent first
      const newAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        adapterType: 'OPENCODE',
        status: 'READY',
        sandboxId: '',
        defaultSessionId: '',
        hasScheduledTasks: false,
        idleTimeout: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.addAgent(newAgent);
      
      // Verify the agent was added
      const afterAddStore = useChatStore.getState();
      expect(afterAddStore.agents.some(a => a.id === 'test-agent')).toBe(true);
      
      // Remove the agent
      store.removeAgent('test-agent');
      const updatedStore = useChatStore.getState();
      
      // Verify the agent was removed
      expect(updatedStore.agents.some(a => a.id === 'test-agent')).toBe(false);
    });
  });
});
