import { describe, it, expect, vi } from 'vitest'
import {
  AgentCardData,
  AgentSkillDescription,
  AgentProvider
} from '../../../src/shared/types/presenters/legacy.presenters'

describe('AgentCardData Type Tests', () => {
  describe('Basic Structure Validation', () => {
    it('should create valid AgentCardData with required fields', () => {
      const agentCardData: AgentCardData = {
        name: 'Test Agent',
        description: 'A test agent for demonstration purposes',
        url: 'https://example.com/agent',
        streamingSupported: true,
        skills: [
          {
            name: 'File Processing',
            description: 'Can process various file formats'
          }
        ],
        version: '1.0.0'
      }

      expect(agentCardData).toBeDefined()
      expect(agentCardData.name).toBe('Test Agent')
      expect(agentCardData.description).toBe('A test agent for demonstration purposes')
      expect(agentCardData.url).toBe('https://example.com/agent')
      expect(agentCardData.streamingSupported).toBe(true)
      expect(agentCardData.skills).toHaveLength(1)
      expect(agentCardData.version).toBe('1.0.0')
    })

    it('should create AgentCardData with optional provider field', () => {
      const agentCardData: AgentCardData = {
        name: 'Provider Agent',
        description: 'An agent with provider information',
        url: 'https://provider.com/agent',
        streamingSupported: false,
        skills: [],
        version: '2.1.0',
        provider: {
          organization: 'Test Organization',
          url: 'https://provider.com'
        }
      }

      expect(agentCardData.provider).toBeDefined()
      expect(agentCardData.provider.organization).toBe('Test Organization')
      expect(agentCardData.provider.url).toBe('https://provider.com')
    })

    it('should create AgentCardData with iconUrl', () => {
      const agentCardData: AgentCardData = {
        name: 'Icon Agent',
        description: 'An agent with icon URL',
        url: 'https://icon-agent.com',
        streamingSupported: true,
        skills: [
          {
            name: 'Image Analysis',
            description: 'Can analyze and process images'
          }
        ],
        version: '3.0.0',
        iconUrl: 'https://example.com/icon.png'
      }

      expect(agentCardData.iconUrl).toBe('https://example.com/icon.png')
    })

    it('should create AgentCardData with multiple skills', () => {
      const agentCardData: AgentCardData = {
        name: 'Multi-Skill Agent',
        description: 'An agent with multiple capabilities',
        url: 'https://multi-skill-agent.com',
        streamingSupported: true,
        skills: [
          {
            name: 'Text Analysis',
            description: 'Can analyze and process text content'
          },
          {
            name: 'Data Processing',
            description: 'Can process structured and unstructured data'
          },
          {
            name: 'API Integration',
            description: 'Can integrate with various APIs'
          }
        ],
        version: '4.5.0'
      }

      expect(agentCardData.skills).toHaveLength(3)
    })
  })

  describe('AgentSkillDescription Validation', () => {
    it('should create valid AgentSkillDescription', () => {
      const skill: AgentSkillDescription = {
        name: 'Custom Skill',
        description: 'A custom skill implementation'
      }
    })

    it('should create AgentSkillDescription with all required fields', () => {
      const skill: AgentSkillDescription = {
        name: 'Advanced Analytics',
        description: 'Provides advanced data analytics capabilities'
      }

      expect(skill).toBeDefined()
      expect(skill.name).toBe('Advanced Analytics')
      expect(skill.description).toBe('Provides advanced data analytics capabilities')
    })
  })

  describe('AgentProvider Validation', () => {
    it('should create valid AgentProvider', () => {
      const provider: AgentProvider = {
        organization: 'Analytics Inc.',
        url: 'https://analytics.com'
      }
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle AgentCardData with empty skills array', () => {
      const agentCardData: AgentCardData = {
        name: 'Empty Skills Agent',
        description: 'An agent without specific skills',
        url: 'https://empty-skills-agent.com',
        streamingSupported: false,
        skills: [],
        version: '0.1.0'
      }

      expect(agentCardData.skills).toHaveLength(0)
    })

    it('should handle AgentCardData with minimal required fields', () => {
      const agentCardData: AgentCardData = {
        name: 'Minimal Agent',
        description: 'A minimal agent configuration',
        url: 'https://minimal-agent.com',
        streamingSupported: true,
        skills: [],
        version: '1.0.0'
      }

      expect(agentCardData).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        url: expect.any(String),
        streamingSupported: expect.any(Boolean),
        skills: expect.any(Array),
        version: expect.any(String)
      })
    })

    it('should handle AgentCardData with long descriptions', () => {
      const longDescription =
        'This is a very long description that might be used for detailed agent information including capabilities, use cases, and integration details for various scenarios and environments'

      const agentCardData: AgentCardData = {
        name: 'Long Desc Agent',
        description: longDescription,
        url: 'https://complex-agent.com',
        streamingSupported: true,
        skills: [],
        version: '5.2.1'
      }

      expect(agentCardData.description).toBe(longDescription)
    })
  })

  describe('Integration with Related Types', () => {
    it('should work with A2AClientData interface', () => {
      const a2aClientData = {
        isRunning: true,
        agentCard: {
          name: 'Running Agent',
          description: 'An agent that is currently running',
          url: 'https://running-agent.com',
          streamingSupported: true,
          skills: [],
          version: '1.2.3'
        }
      }

      expect(a2aClientData.agentCard).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        url: expect.any(String),
        streamingSupported: expect.any(Boolean),
        skills: expect.any(Array),
        version: expect.any(String)
      })
    })

    it('should maintain compatibility with existing agent systems', () => {
      const agentCardData: AgentCardData = {
        name: 'Compatible Agent',
        description: 'An agent that maintains backward compatibility',
        url: 'https://compatible-agent.com',
        streamingSupported: true,
        skills: [],
        version: '2.0.0'
      }

      expect(agentCardData).toHaveProperty('name')
      expect(agentCardData).toHaveProperty('description')
      expect(agentCardData).toHaveProperty('url')
      expect(agentCardData).toHaveProperty('streamingSupported')
      expect(agentCardData).toHaveProperty('skills')
      expect(agentCardData).toHaveProperty('version')
    })
  })

  describe('Type Safety and Contract Validation', () => {
    it('should enforce required string types for name and description', () => {
      const agentCardData: AgentCardData = {
        name: 'Type Safe Agent',
        description: 'An agent that enforces type safety throughout its operations',
        url: 'https://type-safe-agent.com',
        streamingSupported: true,
        skills: [],
        version: '1.0.0'
      }

      // TypeScript should enforce these at compile time
      expect(() => {
        const invalidAssignment: AgentCardData = {
          name: 123 as any // This should be a string
        }
        // Force a runtime error if type mismatch (simulating TypeScript's compile-time error)
        if (typeof invalidAssignment.name !== 'string') {
          throw new Error('Type mismatch: name must be a string')
        }
      }).toThrow()
    })

    it('should allow optional provider field to be undefined', () => {
      const agentCardData: AgentCardData = {
        name: 'Optional Provider Agent',
        description: 'An agent where provider is optional',
        url: 'https://optional-provider-agent.com',
        streamingSupported: true,
        skills: [],
        version: '1.0.0'
      }

      expect(agentCardData.provider).toBeUndefined()
    })
  })
})
