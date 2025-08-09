class StatuteCalculator {
    constructor() {
        this.statuteData = {
            // Federal statutes (in years)
            federal: {
                'personal-injury': { period: 2, note: 'Federal Tort Claims Act - 2 years from accrual' },
                'medical-malpractice': { period: 2, note: 'Federal medical malpractice - 2 years from discovery' },
                'breach-contract': { period: 6, note: 'Federal contracts - 6 years from breach' },
                'employment': { period: 0.5, note: 'EEOC claims - 180/300 days (check specific requirements)' },
                'fraud': { period: 3, note: 'Federal securities fraud - 3 years from discovery, 5 years from violation' }
            },
            
            // California statutes
            california: {
                'personal-injury': { period: 2, note: 'CCP §335.1 - 2 years from injury' },
                'medical-malpractice': { period: 3, note: 'CCP §340.5 - 3 years from injury or 1 year from discovery' },
                'product-liability': { period: 2, note: 'CCP §335.1 - 2 years from injury' },
                'breach-contract': { period: 4, note: 'CCP §337 - 4 years for written contracts, 2 years for oral' },
                'fraud': { period: 3, note: 'CCP §338(d) - 3 years from discovery' },
                'defamation': { period: 1, note: 'CCP §340(c) - 1 year from publication' },
                'employment': { period: 0.75, note: 'Various - 1 year for wrongful termination, 180 days for FEHA claims' },
                'property-damage': { period: 3, note: 'CCP §338 - 3 years from damage' },
                'wrongful-death': { period: 2, note: 'CCP §335.1 - 2 years from death' }
            },
            
            // New York statutes
            'new-york': {
                'personal-injury': { period: 3, note: 'CPLR §214 - 3 years from injury' },
                'medical-malpractice': { period: 2.5, note: 'CPLR §214-a - 2.5 years from malpractice or from end of treatment' },
                'product-liability': { period: 3, note: 'CPLR §214 - 3 years from injury' },
                'breach-contract': { period: 6, note: 'CPLR §213 - 6 years for contracts' },
                'fraud': { period: 6, note: 'CPLR §213(8) - 6 years from fraud or 2 years from discovery' },
                'defamation': { period: 1, note: 'CPLR §215(3) - 1 year from publication' },
                'employment': { period: 3, note: 'Various - typically 3 years for wage claims' },
                'property-damage': { period: 3, note: 'CPLR §214 - 3 years from damage' },
                'wrongful-death': { period: 2, note: 'EPTL §5-4.1 - 2 years from death' }
            },
            
            // Texas statutes
            texas: {
                'personal-injury': { period: 2, note: 'Civ. Prac. & Rem. Code §16.003 - 2 years from injury' },
                'medical-malpractice': { period: 2, note: 'Civ. Prac. & Rem. Code §74.251 - 2 years from incident or discovery' },
                'product-liability': { period: 2, note: 'Civ. Prac. & Rem. Code §16.003 - 2 years from injury' },
                'breach-contract': { period: 4, note: 'Civ. Prac. & Rem. Code §16.004 - 4 years for contracts' },
                'fraud': { period: 4, note: 'Civ. Prac. & Rem. Code §16.004 - 4 years from discovery' },
                'defamation': { period: 1, note: 'Civ. Prac. & Rem. Code §16.002 - 1 year from publication' },
                'employment': { period: 2, note: 'Various - typically 2 years for wage claims' },
                'property-damage': { period: 2, note: 'Civ. Prac. & Rem. Code §16.003 - 2 years from damage' },
                'debt-collection': { period: 4, note: 'Civ. Prac. & Rem. Code §16.004 - 4 years from default' },
                'wrongful-death': { period: 2, note: 'Civ. Prac. & Rem. Code §16.003 - 2 years from death' }
            }
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateCaseTypes();
    }
    
    setupEventListeners() {
        const jurisdictionSelect = document.getElementById('jurisdiction');
        const calculateButton = document.getElementById('calculateButton');
        
        jurisdictionSelect.addEventListener('change', () => {
            this.updateCaseTypes();
            this.clearResults();
        });
        
        calculateButton.addEventListener('click', () => {
            this.calculateStatute();
        });
        
        // Enable calculation on Enter key
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.calculateStatute();
            }
        });
    }
    
    updateCaseTypes() {
        const jurisdiction = document.getElementById('jurisdiction').value;
        const caseTypeSelect = document.getElementById('caseType');
        
        // Clear existing options except the first one
        caseTypeSelect.innerHTML = '<option value="">Select Case Type</option>';
        
        if (!jurisdiction || !this.statuteData[jurisdiction]) {
            return;
        }
        
        const availableCases = Object.keys(this.statuteData[jurisdiction]);
        availableCases.forEach(caseType => {
            const option = document.createElement('option');
            option.value = caseType;
            option.textContent = this.formatCaseTypeName(caseType);
            caseTypeSelect.appendChild(option);
        });
    }
    
    formatCaseTypeName(caseType) {
        const names = {
            'personal-injury': 'Personal Injury',
            'medical-malpractice': 'Medical Malpractice',
            'product-liability': 'Product Liability',
            'breach-contract': 'Breach of Contract',
            'fraud': 'Fraud',
            'defamation': 'Defamation',
            'employment': 'Employment Claims',
            'property-damage': 'Property Damage',
            'debt-collection': 'Debt Collection',
            'wrongful-death': 'Wrongful Death'
        };
        return names[caseType] || caseType;
    }
    
    calculateStatute() {
        const jurisdiction = document.getElementById('jurisdiction').value;
        const caseType = document.getElementById('caseType').value;
        const incidentDate = document.getElementById('incidentDate').value;
        
        if (!jurisdiction || !caseType || !incidentDate) {
            this.showError('Please fill in all required fields.');
            return;
        }
        
        const statuteInfo = this.statuteData[jurisdiction]?.[caseType];
        if (!statuteInfo) {
            this.showError('No statute information available for this jurisdiction and case type combination.');
            return;
        }
        
        const specialCircumstances = this.getSpecialCircumstances();
        const result = this.computeDeadline(incidentDate, statuteInfo, specialCircumstances);
        
        this.displayResults(result, statuteInfo, specialCircumstances);
    }
    
    getSpecialCircumstances() {
        return {
            minorInvolved: document.getElementById('minorInvolved').checked,
            fraudConcealment: document.getElementById('fraudConcealment').checked,
            continuingViolation: document.getElementById('continuingViolation').checked
        };
    }
    
    computeDeadline(incidentDateStr, statuteInfo, specialCircumstances) {
        const incidentDate = new Date(incidentDateStr);
        const today = new Date();
        
        let deadlineDate = new Date(incidentDate);
        let periodYears = statuteInfo.period;
        
        // Apply special circumstances
        let extensions = [];
        
        if (specialCircumstances.minorInvolved) {
            // Typically extends until age of majority plus standard period
            periodYears += 1; // Simplified extension
            extensions.push('Minor involved - extended deadline');
        }
        
        if (specialCircumstances.fraudConcealment) {
            // Discovery rule may apply
            deadlineDate = today; // Assume discovered today for demo
            extensions.push('Fraud concealment - deadline may run from discovery');
        }
        
        if (specialCircumstances.continuingViolation) {
            // Last act in the violation series
            deadlineDate = today; // Assume continuing until today for demo
            extensions.push('Continuing violation - deadline may run from last act');
        }
        
        // Calculate deadline (convert years to milliseconds)
        const millisecondsInYear = 365.25 * 24 * 60 * 60 * 1000;
        deadlineDate.setTime(deadlineDate.getTime() + (periodYears * millisecondsInYear));
        
        const daysRemaining = Math.ceil((deadlineDate - today) / (24 * 60 * 60 * 1000));
        
        return {
            deadlineDate,
            daysRemaining,
            periodYears,
            extensions,
            urgencyLevel: this.getUrgencyLevel(daysRemaining)
        };
    }
    
    getUrgencyLevel(daysRemaining) {
        if (daysRemaining < 0) return 'expired';
        if (daysRemaining <= 30) return 'urgent';
        if (daysRemaining <= 90) return 'warning';
        return 'normal';
    }
    
    displayResults(result, statuteInfo, specialCircumstances) {
        const resultsContainer = document.getElementById('results');
        
        let urgencyClass = result.urgencyLevel === 'expired' ? 'urgent' : 
                          result.urgencyLevel === 'urgent' || result.urgencyLevel === 'warning' ? 'urgent' :
                          result.extensions.length > 0 ? 'extended' : 'normal';
        
        const deadlineDateStr = result.deadlineDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        let statusText = '';
        if (result.daysRemaining < 0) {
            statusText = `<span class="days-remaining" style="color: var(--warning-color);">⚠️ DEADLINE HAS PASSED (${Math.abs(result.daysRemaining)} days ago)</span>`;
        } else if (result.daysRemaining <= 30) {
            statusText = `<span class="days-remaining" style="color: var(--warning-color);">⚠️ URGENT: ${result.daysRemaining} days remaining</span>`;
        } else {
            statusText = `<span class="days-remaining">${result.daysRemaining} days remaining</span>`;
        }
        
        let extensionText = '';
        if (result.extensions.length > 0) {
            extensionText = `<div style="margin-top: 1rem; padding: 0.75rem; background: #fef3c7; border-radius: 0.25rem; border-left: 3px solid #f59e0b;">
                <strong>Special Circumstances Applied:</strong><br>
                ${result.extensions.map(ext => `• ${ext}`).join('<br>')}
            </div>`;
        }
        
        resultsContainer.innerHTML = `
            <div class="result-item ${urgencyClass}">
                <div class="result-title">Statute of Limitations Deadline</div>
                <div class="result-date ${urgencyClass}">${deadlineDateStr}</div>
                ${statusText}
                <div class="result-note">
                    ${statuteInfo.note}
                    <br><br>
                    <strong>Statute Period:</strong> ${result.periodYears} year${result.periodYears !== 1 ? 's' : ''}
                </div>
                ${extensionText}
                ${result.daysRemaining < 90 && result.daysRemaining >= 0 ? 
                  '<div style="margin-top: 1rem; font-weight: 600; color: var(--warning-color);">⚡ Consider immediate action - deadline approaching!</div>' : 
                  ''
                }
            </div>
            
            <div style="margin-top: 1.5rem; padding: 1rem; background: #f0f9ff; border-radius: 0.5rem; border-left: 3px solid var(--secondary-color);">
                <strong>⚠️ Important Reminder:</strong><br>
                This is a general calculation based on common statute periods. Always verify current law in your jurisdiction and consult with a qualified attorney. 
                Some statutes have specific discovery rules, exceptions, or procedural requirements that may affect the actual deadline.
            </div>
        `;
    }
    
    showError(message) {
        const resultsContainer = document.getElementById('results');
        resultsContainer.innerHTML = `
            <div class="result-item urgent">
                <div class="result-title">Error</div>
                <div class="result-note">${message}</div>
            </div>
        `;
    }
    
    clearResults() {
        const resultsContainer = document.getElementById('results');
        resultsContainer.innerHTML = `
            <div class="no-results">
                <p>Enter case details and click "Calculate Deadline" to see results.</p>
            </div>
        `;
    }
}

// Initialize calculator when page loads
document.addEventListener('DOMContentLoaded', () => {
    new StatuteCalculator();
});