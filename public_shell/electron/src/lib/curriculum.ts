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
        "Mathematics", "English Language", "Nigerian Languages",
        "Basic Science", "Physical and Health Education",
        "Christian Religious Studies", "Islamic Studies", "History",
        "Social and Citizenship Studies", "Cultural and Creative Arts",
        "Arabic Language",
      ],
    },
  ],
  pri_upper: [
    {
      cat: "Core",
      subjects: [
        "English Language", "Mathematics", "Nigerian Languages",
        "Basic Science and Technology", "Physical and Health Education",
        "Digital Technologies", "Christian Religious Studies", "Islamic Studies",
        "History", "Social and Citizenship Studies",
        "Cultural and Creative Arts", "Pre-vocational Studies",
        "French", "Arabic Language",
      ],
    },
  ],
  jss: [
    {
      cat: "Core",
      subjects: [
        "English Language", "Mathematics", "Nigerian Languages",
        "Integrated Science", "Physical and Health Education",
        "Digital Technologies", "Christian Religious Studies", "Islamic Studies",
        "History", "Social and Citizenship Studies",
        "Cultural and Creative Arts", "Agricultural Science",
        "Basic Technology", "Home Economics", "French",
      ],
    },
    {
      cat: "Vocational / Optional",
      subjects: [
        "Arabic Language",
        "Solar Photovoltaic Installation and Maintenance",
        "Fashion Design and Garment Making", "Livestock Farming",
        "Beauty and Cosmetology", "Computer Hardware and GSM Repairs",
        "Horticulture and Crop Production",
      ],
    },
  ],
  sss: [
    {
      cat: "Core & Compulsory",
      subjects: [
        "English Language", "General Mathematics",
        "Civic Education", "Digital Technologies",
      ],
    },
    {
      cat: "Science",
      subjects: [
        "Biology", "Chemistry", "Physics", "Agriculture",
        "Further Mathematics", "Physical Education", "Health Education",
        "Food and Nutrition", "Geography", "Technical Drawing",
        "Animal Husbandry", "Fisheries",
      ],
    },
    {
      cat: "Humanities",
      subjects: [
        "History", "Government", "Christian Religious Studies",
        "Islamic Studies", "Hausa", "Igbo", "Yoruba", "French", "Arabic",
        "Fine Art", "Music", "Literature in English",
        "Home Management", "Catering Craft",
      ],
    },
    {
      cat: "Business",
      subjects: ["Financial Accounting", "Commerce", "Marketing", "Economics"],
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
