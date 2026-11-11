import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { SettingsCardTitle } from '@/components/settings/SettingsParts';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useSession } from '@/contexts/SessionContext';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDateForDisplay, getDateKey } from '@/utils/dates';

export function MembersCard() {
  const { user } = useSession();
  const { members, timeZone } = useHousehold();

  return (
    <Card>
      <SettingsCardTitle
        icon="people-outline"
        subtitle="Todos tienen los mismos permisos: cualquiera puede confirmar tareas, registrar e invitar."
        title={`Miembros (${members.length})`}
      />
      <View style={styles.list}>
        {members.map((member) => {
          const isMe = member.usuario_id === user?.id;
          return (
            <View key={member.id} style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.initial}>{member.nombre.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.name}>
                  {member.nombre}
                  {isMe ? ' (tú)' : ''}
                </Text>
                <Text style={styles.meta}>Desde el {formatDateForDisplay(getDateKey(new Date(member.creado_en), timeZone))}</Text>
              </View>
              {member.rol === 'dueño' ? <Tag label="Creó el hogar" tone="primary" /> : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  avatar: { alignItems: 'center', backgroundColor: colors.softPrimary, borderRadius: radius.pill, height: 40, justifyContent: 'center', width: 40 },
  initial: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
