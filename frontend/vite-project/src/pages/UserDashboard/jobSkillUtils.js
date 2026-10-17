const knownSkills = [
  'Machine Learning', 'Artificial Intelligence', 'Deep Learning', 'Natural Language Processing', 'Problem Solving',
  'Project Management', 'Data Analysis', 'Data Structures', 'Software Development', 'Cloud Computing',
  'Spring Boot', 'React Native', 'Automation Testing', 'Power BI', 'Microsoft Excel', 'Google Analytics',
  'Scikit-learn', 'TensorFlow', 'Tailwind CSS', 'Next.js', 'Express.js', 'Node.js', 'Vue.js', 'Angular',
  'TypeScript', 'JavaScript', 'PostgreSQL', 'MySQL', 'MongoDB', 'GraphQL', 'REST APIs', 'REST API', 'C++', 'C#', '.NET',
  'HTML', 'CSS', 'React', 'Python', 'Java', 'Django', 'Flask', 'FastAPI', 'PHP', 'Laravel', 'SQL', 'AWS',
  'Azure', 'GCP', 'Docker', 'Kubernetes', 'DevOps', 'CI/CD', 'Git', 'Linux', 'Redis', 'Figma', 'Tableau',
  'NumPy', 'Pandas', 'PyTorch', 'Selenium', 'Playwright', 'Flutter', 'Android', 'iOS', 'Swift', 'Kotlin',
  'Cybersecurity', 'Networking', 'Algorithms', 'OOP', 'Communication', 'Leadership', 'Teamwork',
  'Customer Service', 'Sales', 'Marketing', 'SEO', 'Content Writing', 'Accounting', 'Recruitment', 'HR',
  'Financial Analysis', 'Presentation', 'Microsoft Office', 'Salesforce', 'UI/UX', 'Testing', 'Excel',
].sort((left, right) => right.length - left.length)

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function skillPattern(skill) {
  return new RegExp(`(^|[^a-z0-9])(${escapeRegExp(skill)})(?=$|[^a-z0-9])`, 'i')
}

export function extractJobSkills(job) {
  const source = [job.requiredSkills, job.description, job.responsibilities].filter(Boolean).join('\n')
  return knownSkills.filter((skill) => skillPattern(skill).test(source)).slice(0, 18)
}
