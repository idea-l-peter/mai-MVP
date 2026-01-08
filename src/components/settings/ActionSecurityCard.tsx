import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Shield, RotateCcw, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ACTION_SECURITY_DEFAULTS,
  getActionsByPlatform,
  PLATFORM_NAMES,
  TIER_INFO,
  type SecurityTier,
  type ActionSecurityConfig,
} from "@/lib/security-tiers";

interface ActionSecurityCardProps {
  overrides: Record<string, SecurityTier>;
  onOverridesChange: (overrides: Record<string, SecurityTier>) => void;
}

const TIER_OPTIONS: SecurityTier[] = [1, 2, 3, 4, 5, 'blocked'];

export function ActionSecurityCard({ overrides, onOverridesChange }: ActionSecurityCardProps) {
  const actionsByPlatform = useMemo(() => getActionsByPlatform(), []);
  
  const handleTierChange = (actionId: string, tier: SecurityTier) => {
    const action = ACTION_SECURITY_DEFAULTS.find(a => a.id === actionId);
    if (!action) return;
    
    const newOverrides = { ...overrides };
    
    // If setting to default, remove the override
    if (tier === action.defaultTier) {
      delete newOverrides[actionId];
    } else {
      newOverrides[actionId] = tier;
    }
    
    onOverridesChange(newOverrides);
  };
  
  const handleResetAction = (actionId: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[actionId];
    onOverridesChange(newOverrides);
  };
  
  const handleResetPlatform = (platform: string) => {
    const actions = actionsByPlatform[platform] || [];
    const newOverrides = { ...overrides };
    for (const action of actions) {
      delete newOverrides[action.id];
    }
    onOverridesChange(newOverrides);
  };
  
  const handleResetAll = () => {
    onOverridesChange({});
  };
  
  const getEffectiveTier = (action: ActionSecurityConfig): SecurityTier => {
    return overrides[action.id] ?? action.defaultTier;
  };
  
  const isModified = (actionId: string): boolean => {
    return actionId in overrides;
  };
  
  const getPlatformModifiedCount = (platform: string): number => {
    const actions = actionsByPlatform[platform] || [];
    return actions.filter(a => isModified(a.id)).length;
  };
  
  const totalModified = Object.keys(overrides).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Action Security</CardTitle>
          </div>
          {totalModified > 0 && (
            <Button variant="outline" size="sm" onClick={handleResetAll}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset All ({totalModified})
            </Button>
          )}
        </div>
        <CardDescription>
          Customize security levels for each action. Higher tiers require stronger confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Tier Legend */}
        <div className="mb-6 p-4 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-3">Security Tier Reference</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TIER_OPTIONS.map(tier => {
              const info = TIER_INFO[tier];
              return (
                <div key={tier} className="flex items-start gap-2">
                  <Badge variant="outline" className={`${info.color} shrink-0`}>
                    {tier === 'blocked' ? 'Blocked' : `Tier ${tier}`}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{info.description}</span>
                </div>
              );
            })}
          </div>
        </div>

        <Accordion type="multiple" className="w-full">
          {Object.entries(actionsByPlatform).map(([platform, actions]) => {
            const modifiedCount = getPlatformModifiedCount(platform);
            
            return (
              <AccordionItem key={platform} value={platform}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{PLATFORM_NAMES[platform]}</span>
                    <Badge variant="secondary" className="text-xs">
                      {actions.length} actions
                    </Badge>
                    {modifiedCount > 0 && (
                      <Badge variant="default" className="text-xs">
                        {modifiedCount} modified
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-2">
                    {modifiedCount > 0 && (
                      <div className="flex justify-end">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleResetPlatform(platform)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Reset {PLATFORM_NAMES[platform]}
                        </Button>
                      </div>
                    )}
                    
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left py-2 px-3 font-medium">Action</th>
                            <th className="text-left py-2 px-3 font-medium w-32">Default</th>
                            <th className="text-left py-2 px-3 font-medium w-40">Current</th>
                            <th className="text-left py-2 px-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {actions.map((action, idx) => {
                            const effectiveTier = getEffectiveTier(action);
                            const modified = isModified(action.id);
                            const tierInfo = TIER_INFO[effectiveTier];
                            const defaultTierInfo = TIER_INFO[action.defaultTier];
                            
                            return (
                              <tr 
                                key={action.id} 
                                className={`border-b last:border-b-0 ${modified ? 'bg-primary/5' : ''}`}
                              >
                                <td className="py-2 px-3">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 cursor-help">
                                          <span>{action.name}</span>
                                          <Info className="h-3 w-3 text-muted-foreground" />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{action.description}</p>
                                        {action.tier3Keyword && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            Confirm: "{action.tier3Keyword}" or {action.tier3Emoji}
                                          </p>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </td>
                                <td className="py-2 px-3">
                                  <Badge variant="outline" className={`${defaultTierInfo.color} text-xs`}>
                                    {action.defaultTier === 'blocked' ? 'Blocked' : `Tier ${action.defaultTier}`}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3">
                                  <Select
                                    value={String(effectiveTier)}
                                    onValueChange={(value) => {
                                      const tier = value === 'blocked' ? 'blocked' : parseInt(value) as SecurityTier;
                                      handleTierChange(action.id, tier);
                                    }}
                                  >
                                    <SelectTrigger className="w-32 h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TIER_OPTIONS.map(tier => {
                                        const info = TIER_INFO[tier];
                                        return (
                                          <SelectItem 
                                            key={tier} 
                                            value={String(tier)}
                                            className={info.color}
                                          >
                                            {tier === 'blocked' ? 'Blocked' : `Tier ${tier}`}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="py-2 px-3">
                                  {modified && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => handleResetAction(action.id)}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
