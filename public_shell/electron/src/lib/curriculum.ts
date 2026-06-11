export interface SubjectGroup {
  cat: string;
  subjects: string[];
}

export type CurriculumPresetsType = Record<'pri_lower' | 'pri_upper' | 'jss' | 'sss', SubjectGroup[]>;

export const CurriculumPresets: CurriculumPresetsType = {
  pri_lower: [
    {
      cat: "Core",
      subjects: [
        "Mathematics", "Nigerian Languages", "Basic Science",
        "Physical & Health Education", "CRS", "IS", "Nigerian History",
        "Social & Citizenship Studies", "Cultural & Creative Arts (CCA)",
        "Arabic Language",
      ],
    },
  ],
  pri_upper: [
    {
      cat: "Core",
      subjects: [
        "English Language", "Mathematics", "Nigerian Languages",
        "Basic Science & Technology", "Physical & Health Education",
        "Basic Digital Literacy", "CRS", "IS", "Nigerian History",
        "Social & Citizenship Studies", "Cultural & Creative Arts (CCA)",
        "Pre-vocational studies", "French", "Arabic Language",
      ],
    },
  ],
  jss: [
    {
      cat: "Core",
      subjects: [
        "English Language", "Mathematics", "Nigerian Languages",
        "Intermediate Science", "Physical & Health Education",
        "Digital Technologies", "CRS", "IS", "Nigerian History",
        "Social & Citizenship Studies", "Cultural & Creative Arts (CCA)",
      ],
    },
    {
      cat: "Trade / Optional",
      subjects: [
        "French", "Arabic Language",
        "Solar Photovoltaic installation and Maintenance",
        "Fashion design and garment making", "Livestock farming",
        "Beauty and cosmetology", "Computer hardware and GSM repairs",
        "Horticulture and crop production",
      ],
    },
  ],
  sss: [
    {
      cat: "Core & Compulsory",
      subjects: [
        "English Language", "General Mathematics",
        "Citizenship and Heritage Studies", "Digital Technologies",
      ],
    },
    {
      cat: "Science",
      subjects: [
        "Biology", "Chemistry", "Physics", "Agriculture",
        "Further Mathematics", "Physical Education", "Health Education",
        "Food & Nutrition", "Geography", "Technical Drawing",
      ],
    },
    {
      cat: "Humanities",
      subjects: [
        "Nigerian History", "Government", "Christian Religious Studies",
        "Islamic Studies", "Hausa", "Igbo", "Yoruba", "French", "Arabic",
        "Visual Arts", "Music", "Literature in English",
        "Home Management", "Catering Craft",
      ],
    },
    {
      cat: "Business",
      subjects: ["Accounting", "Commerce", "Marketing", "Economics"],
    },
    {
      cat: "Trade",
      subjects: [
        "Solar PV Installation and Maintenance",
        "Fashion Design and Garment Making", "Livestock Farming",
        "Beauty and Cosmetology", "Computer Hardware and GSM Repairs",
        "Horticulture and Crop Production",
      ],
    },
  ],
};
