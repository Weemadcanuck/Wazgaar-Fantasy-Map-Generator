export type CustomEntityAuthority = "authored" | "generated" | "archive";
export type CustomFieldType = "text" | "number" | "boolean";

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: CustomFieldType;
}

export interface CustomPointEntity {
  id: string;
  name: string;
  x: number;
  y: number;
  cell: number;
  authority: CustomEntityAuthority;
  notes: string;
  icon?: string;
  color?: string;
  values: Record<string, string | number | boolean>;
}

export interface CustomPointLayer {
  id: string;
  name: string;
  pluralName: string;
  geometry: "point";
  icon: string;
  color: string;
  visible: boolean;
  archiveExport: boolean;
  fields: CustomFieldDefinition[];
  entities: CustomPointEntity[];
}

export type CustomLayer = CustomPointLayer;
