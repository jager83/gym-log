# cardio-logging Specification

## Purpose
Registrare le serie cardio con i dati giusti per la macchina usata, camminata su tappeto o cyclette, e rivederle nello storico e nel grafico senza perdere quelle salvate prima.

## Requirements

### Requirement: Scelta della macchina in sessione
Un esercizio cardio senza macchina fissata in scheda SHALL mostrare sulla card una scelta tra Camminata e Cyclette. La scelta SHALL valere per la serie e restare salvata con essa.

#### Scenario: Cambio macchina
- **WHEN** l'utente apre la card di "Camminata o cyclette" e sceglie Cyclette
- **THEN** la serie risulta registrata come cyclette e la card mostra i campi della cyclette

#### Scenario: Scelta accessibile
- **WHEN** la scelta è mostrata
- **THEN** le due opzioni sono pulsanti raggiungibili da tastiera con stato selezionato annunciato (`aria-pressed`)

### Requirement: Macchina iniziale dall'ultimo uso
All'avvio di una sessione la macchina di una serie cardio SHALL essere quella dell'ultima serie fatta con una macchina per lo stesso esercizio; senza precedenti SHALL essere Camminata.

#### Scenario: Ultima volta cyclette
- **WHEN** l'ultima sessione con "riscaldamento-cardio" fatto aveva la serie su cyclette
- **THEN** la nuova sessione parte con Cyclette selezionata

#### Scenario: Nessun precedente con macchina
- **WHEN** lo storico dell'esercizio ha solo serie senza macchina o è vuoto
- **THEN** la nuova sessione parte con Camminata selezionata

### Requirement: Macchina fissata in scheda
Un esercizio cardio della scheda MAY dichiarare la macchina (`camminata` o `cyclette`). In quel caso la card SHALL NOT mostrare la scelta e la serie SHALL usare sempre quella macchina. Un valore diverso, o la macchina su un esercizio non cardio, SHALL rendere la scheda non valida.

#### Scenario: Spinning
- **WHEN** la scheda dichiara "Pedalata su spinning" con macchina `cyclette`
- **THEN** la card mostra direttamente i campi della cyclette, senza scelta

#### Scenario: Macchina non valida
- **WHEN** un esercizio dichiara macchina `ellittica` o un esercizio `weight` dichiara una macchina
- **THEN** il caricamento della scheda fallisce con un errore che nomina l'esercizio

### Requirement: Campi della camminata
Una serie su Camminata SHALL registrare durata, distanza in km (2 decimali), velocità in km/h (1 decimale) e pendenza in % (1 decimale). Tutti i campi tranne la durata SHALL essere facoltativi.

#### Scenario: Registrazione camminata
- **WHEN** l'utente registra 10:00, 1,2 km, 6,5 km/h, pendenza 4,5
- **THEN** la serie si legge "10:00 · 1,2 km · 6,5 km/h · 4,5%"

### Requirement: Campi della cyclette
Una serie su Cyclette SHALL registrare durata, potenza in watt (intero) e cadenza in pedalate al minuto (intero). Distanza e livello SHALL NOT essere mostrati. Tutti i campi tranne la durata SHALL essere facoltativi.

#### Scenario: Registrazione cyclette
- **WHEN** l'utente registra 15:00, 120 W, 85 rpm
- **THEN** la serie si legge "15:00 · 120 W · 85 rpm"

#### Scenario: Cambio macchina dopo aver scritto valori
- **WHEN** l'utente ha scritto 1,2 km su Camminata e passa a Cyclette
- **THEN** la card mostra solo durata, potenza e cadenza, e la serie salvata non riporta i km nel riepilogo della cyclette

### Requirement: Serie cardio salvate prima
Le serie cardio senza macchina (salvate prima di questa funzione, con km, livello e km/h) SHALL restare valide in caricamento, importazione e backup, e SHALL mostrarsi come prima: durata, km, "liv", km/h.

#### Scenario: Backup vecchio
- **WHEN** l'utente importa un backup con serie cardio `{ duration, distance, level, speed }` senza macchina
- **THEN** l'import riesce e lo storico mostra "5:00 · 0,6 km · liv 3 · 6 km/h"

### Requirement: Storico e grafico cardio per macchina
Il grafico di un esercizio cardio SHALL usare solo le voci della stessa macchina della voce più recente (le voci senza macchina fanno gruppo a sé). Camminata SHALL usare la distanza massima in km, Cyclette la potenza massima in W; senza quei valori SHALL usare la durata in minuti.

#### Scenario: Grafico cyclette
- **WHEN** le ultime voci di "spinning" sono su cyclette con potenza 110 W e 120 W
- **THEN** il grafico ha etichetta "Potenza (W)" e i punti 110 e 120

#### Scenario: Ultima voce camminata in uno storico misto
- **WHEN** "riscaldamento-cardio" ha voci cyclette e l'ultima è camminata con 0,8 km
- **THEN** il grafico ha etichetta "Distanza (km)" e solo punti delle voci camminata

#### Scenario: Nessun valore della macchina
- **WHEN** le voci cyclette hanno solo la durata
- **THEN** il grafico usa "Durata (min)"
