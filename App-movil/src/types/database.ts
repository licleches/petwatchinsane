// Tipos de la base de datos de PetWatch.
// Reflejan supabase/migrations/20261108125000_ajustes.sql (esquema que usa src/)
// más 20261108130000_watch.sql (tareas_programadas.dispositivo_id). Los cambios de
// esquema van en migraciones nuevas (>= 20261108140000); actualiza también este archivo.

export type HouseholdRole = 'dueño' | 'miembro';
export type Species = 'perro' | 'gato' | 'ave' | 'conejo' | 'roedor' | 'reptil' | 'pez' | 'otro';
export type PetSex = 'macho' | 'hembra';
export type CareType = 'comida' | 'medicamento' | 'paseo' | 'otro';
export type TaskStatus = 'pendiente' | 'hecha' | 'pospuesta' | 'omitida';
export type IncidentType = 'vomito' | 'no_comio' | 'cojea' | 'diarrea' | 'pelea' | 'otro';
export type RecordOrigin = 'reloj' | 'app';

/** Punto de una ruta de paseo. `ts` son milisegundos desde epoch (opcional). */
export type RoutePoint = {
  lat: number;
  lng: number;
  ts?: number;
};

export type ProfileRow = {
  id: string;
  nombre: string;
  zona_horaria: string;
  creado_en: string;
  actualizado_en: string;
};

export type HouseholdRow = {
  id: string;
  nombre: string;
  zona_horaria: string;
  codigo_invitacion: string | null;
  codigo_expira_en: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type HouseholdMemberRow = {
  id: string;
  hogar_id: string;
  usuario_id: string;
  rol: HouseholdRole;
  creado_en: string;
  actualizado_en: string;
};

export type PetRow = {
  id: string;
  hogar_id: string;
  nombre: string;
  especie: Species;
  raza: string | null;
  sexo: PetSex | null;
  fecha_nacimiento: string | null;
  peso_kg: number | null;
  /** Ruta del archivo dentro del bucket privado `fotos-mascotas`. */
  foto_url: string | null;
  meta_paseo_min_dia: number;
  notas: string | null;
  activa: boolean;
  creado_en: string;
  actualizado_en: string;
};

export type CareRow = {
  id: string;
  mascota_id: string;
  tipo: CareType;
  nombre: string;
  detalle: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

export type CareScheduleRow = {
  id: string;
  cuidado_id: string;
  hora: string;
  /** 0 = domingo ... 6 = sábado. */
  dias_semana: number[];
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

export type TaskRow = {
  id: string;
  horario_id: string;
  hogar_id: string;
  mascota_id: string;
  programada_para: string;
  estado: TaskStatus;
  /** Quién resolvió la tarea (hecha u omitida). Lo asigna un trigger. */
  hecha_por: string | null;
  hecha_en: string | null;
  pospuesta_hasta: string | null;
  /**
   * Reloj que hizo el último cambio de estado (migración 20261108130000_watch.sql).
   * null si el cambio vino de la app. Opcional por si esa migración aún no se aplica.
   */
  dispositivo_id?: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type VaccineRow = {
  id: string;
  mascota_id: string;
  nombre: string;
  aplicada_en: string;
  proxima_en: string | null;
  veterinario: string | null;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type VetVisitRow = {
  id: string;
  mascota_id: string;
  fecha: string;
  clinica: string | null;
  motivo: string;
  diagnostico: string | null;
  tratamiento: string | null;
  costo: number | null;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type WalkRow = {
  id: string;
  hogar_id: string;
  iniciado_en: string;
  terminado_en: string | null;
  duracion_seg: number;
  distancia_m: number | null;
  pasos: number | null;
  ruta: RoutePoint[] | null;
  /** Columna generada: número de puntos de la ruta. */
  puntos_ruta: number;
  origen: RecordOrigin;
  dispositivo_id: string | null;
  registrado_por: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type WalkPetRow = {
  id: string;
  paseo_id: string;
  mascota_id: string;
  creado_en: string;
  actualizado_en: string;
};

export type IncidentRow = {
  id: string;
  hogar_id: string;
  mascota_id: string;
  tipo: IncidentType;
  ocurrido_en: string;
  lat: number | null;
  lng: number | null;
  paseo_id: string | null;
  nota: string | null;
  origen: RecordOrigin;
  dispositivo_id: string | null;
  registrado_por: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type PetInsert = {
  id?: string;
  hogar_id: string;
  nombre: string;
  especie: Species;
  raza?: string | null;
  sexo?: PetSex | null;
  fecha_nacimiento?: string | null;
  peso_kg?: number | null;
  foto_url?: string | null;
  meta_paseo_min_dia?: number;
  notas?: string | null;
  activa?: boolean;
};
export type PetUpdate = Partial<Omit<PetInsert, 'id' | 'hogar_id'>>;

export type CareInsert = {
  id?: string;
  mascota_id: string;
  tipo: CareType;
  nombre: string;
  detalle?: string | null;
  activo?: boolean;
};
export type CareUpdate = Partial<Omit<CareInsert, 'id' | 'mascota_id'>>;

export type CareScheduleInsert = {
  id?: string;
  cuidado_id: string;
  hora: string;
  dias_semana: number[];
  activo?: boolean;
};
export type CareScheduleUpdate = { activo?: boolean };

export type TaskUpdate = {
  estado?: TaskStatus;
  pospuesta_hasta?: string | null;
};

export type VaccineInsert = {
  id?: string;
  mascota_id: string;
  nombre: string;
  aplicada_en: string;
  proxima_en?: string | null;
  veterinario?: string | null;
  notas?: string | null;
};
export type VaccineUpdate = Partial<Omit<VaccineInsert, 'id' | 'mascota_id'>>;

export type VetVisitInsert = {
  id?: string;
  mascota_id: string;
  fecha: string;
  clinica?: string | null;
  motivo: string;
  diagnostico?: string | null;
  tratamiento?: string | null;
  costo?: number | null;
  notas?: string | null;
};
export type VetVisitUpdate = Partial<Omit<VetVisitInsert, 'id' | 'mascota_id'>>;

export type IncidentInsert = {
  id?: string;
  mascota_id: string;
  tipo: IncidentType;
  ocurrido_en?: string;
  lat?: number | null;
  lng?: number | null;
  paseo_id?: string | null;
  nota?: string | null;
  origen?: RecordOrigin;
  dispositivo_id?: string | null;
};
export type IncidentUpdate = { nota?: string | null };

export type CareScheduleInput = {
  hora: string;
  dias_semana: number[];
};

/** Tablas que la app solo lee (se escriben con funciones RPC o triggers). */
type NoWrite = { [key: string]: never };

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      perfiles: TableDefinition<ProfileRow, NoWrite, { nombre?: string; zona_horaria?: string }>;
      hogares: TableDefinition<HouseholdRow, NoWrite, { nombre?: string; zona_horaria?: string }>;
      hogar_miembros: TableDefinition<HouseholdMemberRow, NoWrite, NoWrite>;
      mascotas: TableDefinition<PetRow, PetInsert, PetUpdate>;
      cuidados: TableDefinition<CareRow, CareInsert, CareUpdate>;
      horarios_cuidado: TableDefinition<CareScheduleRow, CareScheduleInsert, CareScheduleUpdate>;
      tareas_programadas: TableDefinition<TaskRow, NoWrite, TaskUpdate>;
      vacunas: TableDefinition<VaccineRow, VaccineInsert, VaccineUpdate>;
      visitas_veterinario: TableDefinition<VetVisitRow, VetVisitInsert, VetVisitUpdate>;
      paseos: TableDefinition<WalkRow, NoWrite, NoWrite>;
      paseo_mascotas: TableDefinition<WalkPetRow, NoWrite, NoWrite>;
      incidentes: TableDefinition<IncidentRow, IncidentInsert, IncidentUpdate>;
    };
    Views: { [_ in never]: never };
    Functions: {
      es_miembro_hogar: {
        Args: { p_hogar_id: string };
        Returns: boolean;
      };
      crear_hogar: {
        Args: { p_nombre: string; p_zona_horaria: string };
        Returns: string;
      };
      unirse_hogar: {
        Args: { p_codigo: string };
        Returns: string;
      };
      generar_codigo_invitacion: {
        Args: { p_hogar_id: string };
        Returns: string;
      };
      generar_tareas: {
        Args: { p_hogar_id: string; p_dias: number };
        Returns: number;
      };
      guardar_cuidado: {
        Args: {
          p_cuidado_id: string | null;
          p_mascota_id: string;
          p_tipo: CareType;
          p_nombre: string;
          p_detalle: string | null;
          p_horarios: CareScheduleInput[];
        };
        Returns: string;
      };
      registrar_paseo: {
        Args: {
          p_id: string;
          p_hogar_id: string;
          p_iniciado_en: string;
          p_duracion_seg: number;
          p_distancia_m: number | null;
          p_pasos: number | null;
          p_mascotas: string[];
        };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type HouseholdWithRole = HouseholdRow & { rol: HouseholdRole };

export type HouseholdMember = HouseholdMemberRow & { nombre: string };

export type CareWithSchedules = CareRow & { horarios: CareScheduleRow[] };

export type TaskWithContext = TaskRow & {
  horario: CareScheduleRow;
  cuidado: CareRow;
  mascota: PetRow;
};

/** Paseo para listas: sin la ruta completa (solo puntos_ruta). */
export type WalkSummary = Omit<WalkRow, 'ruta'>;

export type WalkWithPets = WalkSummary & { mascota_ids: string[] };

export type WalkDetail = WalkRow & { mascota_ids: string[] };
