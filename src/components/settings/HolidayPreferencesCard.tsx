import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Holiday {
  id: string;
  name: string;
  type: string;
  holiday_date: string;
  regions: string[] | null;
}

interface HolidayPreferencesCardProps {
  observedHolidays: string[];
  onHolidaysChange: (holidays: string[]) => void;
}

const TYPE_LABELS: Record<string, string> = {
  religious: "Religious Holidays",
  cultural: "Cultural Celebrations",
  national: "National Holidays",
  international: "International Observances",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  religious: "🙏",
  cultural: "🎉",
  national: "🏛️",
  international: "🌍",
};

export function HolidayPreferencesCard({ observedHolidays, onHolidaysChange }: HolidayPreferencesCardProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchHolidays() {
      const { data, error } = await supabase
        .from('holidays')
        .select('id, name, type, holiday_date, regions')
        .order('type')
        .order('name');

      if (error) {
        console.error('Error fetching holidays:', error);
      } else {
        setHolidays(data || []);
      }
      setIsLoading(false);
    }

    fetchHolidays();
  }, []);

  const handleToggle = (holidayId: string) => {
    if (observedHolidays.includes(holidayId)) {
      onHolidaysChange(observedHolidays.filter(id => id !== holidayId));
    } else {
      onHolidaysChange([...observedHolidays, holidayId]);
    }
  };

  const handleSelectAll = (type: string) => {
    const typeHolidayIds = holidays.filter(h => h.type === type).map(h => h.id);
    const allSelected = typeHolidayIds.every(id => observedHolidays.includes(id));
    
    if (allSelected) {
      onHolidaysChange(observedHolidays.filter(id => !typeHolidayIds.includes(id)));
    } else {
      const newIds = typeHolidayIds.filter(id => !observedHolidays.includes(id));
      onHolidaysChange([...observedHolidays, ...newIds]);
    }
  };

  // Group holidays by type
  const groupedHolidays = holidays.reduce((acc, holiday) => {
    if (!acc[holiday.type]) {
      acc[holiday.type] = [];
    }
    acc[holiday.type].push(holiday);
    return acc;
  }, {} as Record<string, Holiday[]>);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <CardTitle>Holiday Preferences</CardTitle>
        </div>
        <CardDescription>
          Select which holidays you observe. mai will remind you about these and suggest outreach to contacts who may celebrate them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(groupedHolidays).map(([type, typeHolidays]) => {
          const allSelected = typeHolidays.every(h => observedHolidays.includes(h.id));
          const someSelected = typeHolidays.some(h => observedHolidays.includes(h.id));
          
          return (
            <div key={type} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{TYPE_ICONS[type]}</span>
                  <h4 className="font-medium">{TYPE_LABELS[type] || type}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectAll(type)}
                  className="text-xs text-primary hover:underline"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                {typeHolidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={holiday.id}
                      checked={observedHolidays.includes(holiday.id)}
                      onCheckedChange={() => handleToggle(holiday.id)}
                    />
                    <Label 
                      htmlFor={holiday.id} 
                      className="text-sm font-normal cursor-pointer flex items-center gap-1.5"
                    >
                      {holiday.name}
                      {holiday.regions && holiday.regions.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ({holiday.regions.slice(0, 2).join(", ")})
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {holidays.length === 0 && (
          <div className="text-center text-muted-foreground py-4">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No holidays found in the database.</p>
          </div>
        )}

        <div className="rounded-lg bg-muted p-4 space-y-1">
          <p className="text-sm font-medium">
            {observedHolidays.length} holiday{observedHolidays.length !== 1 ? 's' : ''} selected
          </p>
          <p className="text-xs text-muted-foreground">
            mai will include these in your daily briefing and outreach suggestions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
