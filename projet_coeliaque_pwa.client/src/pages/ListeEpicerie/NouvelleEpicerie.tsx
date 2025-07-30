import React, { useState } from 'react';

interface EpicerieFormData {
  nom: string;
  adresse: string;
  telephone: string;
  description: string;
}

const NouvelleEpicerie: React.FC = () => {
  const [formData, setFormData] = useState<EpicerieFormData>({
    nom: '',
    adresse: '',
    telephone: '',
    description: '',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Add API call to save the new epicerie
    setSubmitted(true);
  };

  return (
    <div className="nouvelle-epicerie-page">
      <h1>Ajouter une nouvelle épicerie</h1>
      {submitted ? (
        <div className="success-message">
          <p>L'épicerie a été ajoutée avec succès !</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="epicerie-form">
          <div>
            <label htmlFor="nom">Nom</label>
            <input
              type="text"
              id="nom"
              name="nom"
              value={formData.nom}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label htmlFor="adresse">Adresse</label>
            <input
              type="text"
              id="adresse"
              name="adresse"
              value={formData.adresse}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label htmlFor="telephone">Téléphone</label>
            <input
              type="tel"
              id="telephone"
              name="telephone"
              value={formData.telephone}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
            />
          </div>
          <button type="submit">Ajouter</button>
        </form>
      )}
    </div>
  );
};

export default NouvelleEpicerie;
