
const priorities = [
  'Critical', 'Critical', 'High', 'High', 'High',
  'Medium', 'Medium', 'Medium', 'Low', 'Low',
  'High', 'Medium', 'High', 'Low', 'Critical'
];

const statuses = [
  'Open', 'Open', 'Open', 'Open', 'Open',
  'Open', 'Open', 'In Progress', 'In Progress',
  'In Progress', 'Resolved', 'Resolved',
  'Resolved', 'Resolved', 'Resolved'
];

export function publicDemoIncidents() {
  return priorities.map((priority, index) => ({
    id: `demo-incident-${String(index + 1).padStart(3, '0')}`,
    createdTime: '2026-11-16',
    priority,
    status: statuses[index],
    category: 'Security Incident',
    source: 'Synthetic Demo',
    subject: `Demo Security Incident ${index + 1}`,
    description: 'Fictional incident created for the IronInbox demonstration.',
    reporter: 'Demo Security Team',
    assignedTo: 'Demo Analyst',
    dueDate: '',
  }));
}
